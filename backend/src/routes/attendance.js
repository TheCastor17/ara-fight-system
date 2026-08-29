import { Router } from 'express';
import Joi from 'joi';

import { admin } from '../db.js';

import {
  authenticate,
  allow
} from '../middleware/auth.js';

import { validate } from '../middleware/validate.js';

import {
  asyncRoute,
  appError
} from '../utils.js';

import { audit } from '../services/audit.js';

const router = Router();

router.use(authenticate);

/*
 * Fecha actual de Lima en formato YYYY-MM-DD.
 */
function getLimaDate() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

/*
 * Comprueba que la fecha tenga el formato YYYY-MM-DD.
 */
function isValidDate(value) {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    return false;
  }

  const date = new Date(`${value}T12:00:00Z`);

  return !Number.isNaN(date.getTime());
}

/*
 * Esquema para guardar asistencia masiva.
 */
const bulkAttendanceSchema = Joi.object({
  class_id: Joi
    .string()
    .uuid()
    .required(),

  date: Joi
    .string()
    .custom((value, helpers) => {
      if (!isValidDate(value)) {
        return helpers.error('date.invalid');
      }

      return value;
    })
    .required()
    .messages({
      'date.invalid':
        'La fecha debe tener el formato YYYY-MM-DD.'
    }),

  records: Joi
    .array()
    .min(1)
    .max(100)
    .items(
      Joi.object({
        student_id: Joi
          .string()
          .uuid()
          .required(),

        status: Joi
          .string()
          .valid(
            'present',
            'late',
            'absent',
            'justified'
          )
          .required(),

        notes: Joi
          .string()
          .trim()
          .max(300)
          .allow('', null)
          .default(null)
      })
    )
    .required()
});

/*
 * GET /api/attendance/class/:classId
 *
 * Obtiene:
 * - Datos de la clase.
 * - Alumnos inscritos.
 * - Asistencia registrada en la fecha seleccionada.
 */
router.get(
  '/class/:classId',
  allow('admin', 'staff'),
  asyncRoute(async (req, res) => {
    const classId = req.params.classId;
    const selectedDate =
      req.query.date || getLimaDate();

    if (!isValidDate(selectedDate)) {
      throw appError(
        400,
        'FECHA_INVALIDA',
        'Utiliza el formato YYYY-MM-DD.'
      );
    }

    /*
     * 1. Obtener la clase.
     */
    const {
      data: classData,
      error: classError
    } = await admin
      .from('classes')
      .select(
        `
        id,
        branch_id,
        discipline_id,
        name,
        instructor_id,
        weekdays,
        start_time,
        duration_minutes,
        capacity,
        active,
        created_at
        `
      )
      .eq('id', classId)
      .maybeSingle();

    if (classError) {
      throw classError;
    }

    if (!classData) {
      throw appError(
        404,
        'CLASE_NO_ENCONTRADA'
      );
    }

    /*
     * El Staff solo puede consultar clases de su sede.
     */
    if (
      req.profile.role === 'staff' &&
      classData.branch_id !== req.profile.branch_id
    ) {
      throw appError(
        403,
        'SEDE_NO_AUTORIZADA'
      );
    }

    /*
     * 2. Obtener los alumnos inscritos.
     *
     * Aquí sí existe relación directa:
     * enrollments.student_id -> students.id
     */
    const {
      data: enrollmentData,
      error: enrollmentError
    } = await admin
      .from('enrollments')
      .select(
        `
        id,
        student_id,
        class_id,
        active,
        created_at,
        students!inner(
          id,
          first_name,
          last_name,
          document,
          photo_path,
          active,
          branch_id
        )
        `
      )
      .eq('class_id', classId)
      .eq('active', true)
      .eq('students.active', true)
      .order('created_at', {
        ascending: true
      });

    if (enrollmentError) {
      throw enrollmentError;
    }

    const enrollments = enrollmentData || [];

    /*
     * Si no hay alumnos inscritos, devolver una respuesta válida.
     */
    if (enrollments.length === 0) {
      return res.json({
        class: classData,
        date: selectedDate,
        totalStudents: 0,
        summary: {
          present: 0,
          late: 0,
          absent: 0,
          justified: 0,
          unregistered: 0
        },
        students: []
      });
    }

    const studentIds = enrollments.map(
      (enrollment) => enrollment.student_id
    );

    /*
     * 3. Consultar attendance por separado.
     *
     * No existe una relación directa:
     * enrollments -> attendance
     */
    const {
      data: attendanceData,
      error: attendanceError
    } = await admin
      .from('attendance')
      .select(
        `
        id,
        student_id,
        class_id,
        date,
        status,
        notes,
        recorded_by,
        created_at
        `
      )
      .eq('class_id', classId)
      .eq('date', selectedDate)
      .in('student_id', studentIds);

    if (attendanceError) {
      throw attendanceError;
    }

    const attendanceByStudent = new Map(
      (attendanceData || []).map((record) => [
        record.student_id,
        record
      ])
    );

    /*
     * 4. Combinar alumnos inscritos con su asistencia.
     *
     * attendance se conserva como arreglo porque el frontend usa:
     * row.attendance?.[0]?.status
     */
    const students = enrollments.map((enrollment) => {
      const attendanceRecord =
        attendanceByStudent.get(
          enrollment.student_id
        );

      return {
        enrollment_id: enrollment.id,
        student_id: enrollment.student_id,
        class_id: enrollment.class_id,
        students: enrollment.students,
        attendance: attendanceRecord
          ? [attendanceRecord]
          : []
      };
    });

    /*
     * 5. Calcular resumen.
     */
    const summary = {
      present: 0,
      late: 0,
      absent: 0,
      justified: 0,
      unregistered: 0
    };

    for (const item of students) {
      const status =
        item.attendance?.[0]?.status;

      if (
        status &&
        Object.prototype.hasOwnProperty.call(
          summary,
          status
        )
      ) {
        summary[status] += 1;
      } else {
        summary.unregistered += 1;
      }
    }

    return res.json({
      class: classData,
      date: selectedDate,
      totalStudents: students.length,
      summary,
      students
    });
  })
);

/*
 * POST /api/attendance/bulk
 *
 * Registra o modifica la asistencia de una clase.
 */
router.post(
  '/bulk',
  allow('admin', 'staff'),
  validate(bulkAttendanceSchema),
  asyncRoute(async (req, res) => {
    const {
      class_id: classId,
      date,
      records
    } = req.body;

    /*
     * 1. Verificar la clase.
     */
    const {
      data: classData,
      error: classError
    } = await admin
      .from('classes')
      .select(
        `
        id,
        branch_id,
        name,
        active
        `
      )
      .eq('id', classId)
      .maybeSingle();

    if (classError) {
      throw classError;
    }

    if (!classData) {
      throw appError(
        404,
        'CLASE_NO_ENCONTRADA'
      );
    }

    if (!classData.active) {
      throw appError(
        409,
        'CLASE_INACTIVA',
        'No se puede registrar asistencia en una clase inactiva.'
      );
    }

    /*
     * El Staff solo puede registrar asistencia en su sede.
     */
    if (
      req.profile.role === 'staff' &&
      classData.branch_id !== req.profile.branch_id
    ) {
      throw appError(
        403,
        'SEDE_NO_AUTORIZADA'
      );
    }

    /*
     * 2. Evitar alumnos duplicados dentro de la solicitud.
     */
    const studentIds = records.map(
      (record) => record.student_id
    );

    const uniqueStudentIds = [
      ...new Set(studentIds)
    ];

    if (
      uniqueStudentIds.length !==
      studentIds.length
    ) {
      throw appError(
        400,
        'ALUMNOS_DUPLICADOS',
        'Hay alumnos repetidos dentro del registro de asistencia.'
      );
    }

    /*
     * 3. Verificar que todos los alumnos pertenezcan a la clase.
     */
    const {
      data: enrollmentData,
      error: enrollmentError
    } = await admin
      .from('enrollments')
      .select('student_id')
      .eq('class_id', classId)
      .eq('active', true)
      .in('student_id', uniqueStudentIds);

    if (enrollmentError) {
      throw enrollmentError;
    }

    const enrolledStudentIds = new Set(
      (enrollmentData || []).map(
        (enrollment) => enrollment.student_id
      )
    );

    const notEnrolled = uniqueStudentIds.filter(
      (studentId) => {
        return !enrolledStudentIds.has(studentId);
      }
    );

    if (notEnrolled.length > 0) {
      throw appError(
        400,
        'ALUMNO_NO_INSCRITO_EN_CLASE',
        {
          student_ids: notEnrolled
        }
      );
    }

    /*
     * 4. Construir los registros que se enviarán a Supabase.
     */
    const rows = records.map((record) => ({
      student_id: record.student_id,
      class_id: classId,
      date,
      status: record.status,
      notes: record.notes || null,
      recorded_by: req.user.id
    }));

    /*
     * 5. Insertar o actualizar.
     *
     * La tabla attendance posee una restricción única formada por:
     * student_id, class_id, date
     */
    const {
      data,
      error
    } = await admin
      .from('attendance')
      .upsert(
        rows,
        {
          onConflict:
            'student_id,class_id,date'
        }
      )
      .select(
        `
        id,
        student_id,
        class_id,
        date,
        status,
        notes,
        recorded_by,
        created_at
        `
      );

    if (error) {
      throw error;
    }

    /*
     * 6. Registrar auditoría.
     */
    await audit(
      req,
      'bulk_upsert',
      'attendance',
      classId,
      null,
      {
        class_id: classId,
        class_name: classData.name,
        date,
        count: rows.length,
        records: rows.map((row) => ({
          student_id: row.student_id,
          status: row.status
        }))
      }
    );

    /*
     * 7. Crear resumen de lo guardado.
     */
    const summary = {
      present: 0,
      late: 0,
      absent: 0,
      justified: 0
    };

    for (const record of data || []) {
      if (
        Object.prototype.hasOwnProperty.call(
          summary,
          record.status
        )
      ) {
        summary[record.status] += 1;
      }
    }

    return res.json({
      message:
        'Asistencia guardada correctamente.',
      class_id: classId,
      date,
      total: data?.length || 0,
      summary,
      records: data || []
    });
  })
);

/*
 * GET /api/attendance/me
 *
 * El Alumno consulta exclusivamente su historial.
 */
router.get(
  '/me',
  allow('student'),
  asyncRoute(async (req, res) => {
    const {
      data: student,
      error: studentError
    } = await admin
      .from('students')
      .select(
        `
        id,
        first_name,
        last_name
        `
      )
      .eq('user_id', req.user.id)
      .maybeSingle();

    if (studentError) {
      throw studentError;
    }

    /*
     * La cuenta puede existir antes de estar vinculada
     * con un alumno.
     */
    if (!student) {
      return res.json({
        student: null,
        summary: {
          total: 0,
          present: 0,
          late: 0,
          absent: 0,
          justified: 0,
          attendanceRate: 0
        },
        records: []
      });
    }

    const {
      data,
      error
    } = await admin
      .from('attendance')
      .select(
        `
        id,
        student_id,
        class_id,
        date,
        status,
        notes,
        created_at,
        classes!inner(
          id,
          name,
          start_time,
          duration_minutes,
          branch_id
        )
        `
      )
      .eq('student_id', student.id)
      .order('date', {
        ascending: false
      })
      .limit(200);

    if (error) {
      throw error;
    }

    const records = data || [];

    const summary = {
      total: records.length,
      present: 0,
      late: 0,
      absent: 0,
      justified: 0,
      attendanceRate: 0
    };

    for (const record of records) {
      if (
        Object.prototype.hasOwnProperty.call(
          summary,
          record.status
        )
      ) {
        summary[record.status] += 1;
      }
    }

    const attended =
      summary.present +
      summary.late;

    summary.attendanceRate = summary.total
      ? Math.round(
          (
            attended /
            summary.total
          ) * 100
        )
      : 0;

    return res.json({
      student,
      summary,
      records
    });
  })
);

export default router;