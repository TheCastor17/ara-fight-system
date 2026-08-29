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
 * Aplica el filtro de sede.
 *
 * Staff:
 * Siempre usa la sede asignada en public.profiles.
 *
 * Administrador:
 * Puede usar branch_id enviado mediante query string.
 */
function getBranchId(req) {
  if (req.profile.role === 'staff') {
    return req.profile.branch_id || null;
  }

  return req.query.branch_id || null;
}

/*
 * Devuelve la fecha actual en formato YYYY-MM-DD.
 *
 * Se utiliza America/Lima para evitar que el cambio de fecha UTC
 * adelante o retroceda artificialmente la jornada de asistencia.
 */
function getLimaDate() {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });

  return formatter.format(new Date());
}

/*
 * Obtiene el primer día del mes y el primer día del mes siguiente.
 */
function getMonthRange() {
  const now = new Date();

  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit'
  });

  const month = formatter.format(now);
  const [yearValue, monthValue] = month
    .split('-')
    .map(Number);

  const start = `${yearValue}-${String(monthValue).padStart(
    2,
    '0'
  )}-01`;

  const nextMonthDate = new Date(
    Date.UTC(
      yearValue,
      monthValue,
      1
    )
  );

  const nextYear = nextMonthDate.getUTCFullYear();
  const nextMonth = nextMonthDate.getUTCMonth() + 1;

  const end = `${nextYear}-${String(nextMonth).padStart(
    2,
    '0'
  )}-01`;

  return {
    start,
    end
  };
}

/*
 * GET /api/dashboard/summary
 *
 * Devuelve indicadores reales.
 *
 * Administrador:
 * - Alumnos activos.
 * - Asistencia del día.
 * - Ingresos del mes.
 * - Mensualidades vencidas.
 *
 * Staff:
 * - Alumnos activos de su sede.
 * - Asistencia de su sede.
 * - No obtiene información financiera.
 *
 * Alumno:
 * - Clases registradas en el mes.
 * - Porcentaje de asistencia.
 * - Saldo pendiente.
 * - Próxima fecha de pago.
 */
router.get(
  '/summary',
  asyncRoute(async (req, res) => {
    /*
     * Dashboard personal del Alumno.
     */
    if (req.profile.role === 'student') {
      const {
        data: student,
        error: studentError
      } = await admin
        .from('students')
        .select('id')
        .eq('user_id', req.user.id)
        .maybeSingle();

      if (studentError) {
        throw studentError;
      }

      /*
       * El usuario puede existir antes de que su cuenta sea
       * vinculada con un registro de alumno.
       */
      if (!student) {
        return res.json({
          classesThisMonth: 0,
          attendanceRate: 0,
          attendanceCount: 0,
          pendingAmount: 0,
          nextPayment: null
        });
      }

      const today = getLimaDate();
      const currentMonth = today.slice(0, 7);
      const monthStart = `${currentMonth}-01`;

      const {
        data: attendance,
        error: attendanceError
      } = await admin
        .from('attendance')
        .select('status,date')
        .eq('student_id', student.id)
        .gte('date', monthStart)
        .lte('date', today);

      if (attendanceError) {
        throw attendanceError;
      }

      const attendanceRows = attendance || [];

      const attendedCount = attendanceRows.filter((item) => {
        return [
          'present',
          'late'
        ].includes(item.status);
      }).length;

      const attendanceRate = attendanceRows.length
        ? Math.round(
            (
              attendedCount /
              attendanceRows.length
            ) * 100
          )
        : 0;

      const {
        data: invoices,
        error: invoicesError
      } = await admin
        .from('payment_overview')
        .select(
          'id,balance,due_date,status'
        )
        .eq('student_id', student.id)
        .gt('balance', 0)
        .order('due_date', {
          ascending: true
        });

      if (invoicesError) {
        throw invoicesError;
      }

      const pendingInvoices = invoices || [];

      const pendingAmount = pendingInvoices.reduce(
        (total, invoice) => {
          return total + Number(invoice.balance || 0);
        },
        0
      );

      return res.json({
        classesThisMonth: attendanceRows.length,
        attendanceRate,
        attendanceCount: attendanceRows.length,
        pendingAmount,
        nextPayment:
          pendingInvoices[0]?.due_date || null
      });
    }

    /*
     * Dashboard del Administrador y Staff.
     */
    const branchId = getBranchId(req);
    const today = getLimaDate();
    const monthRange = getMonthRange();

    /*
     * Consulta de alumnos activos.
     */
    let studentsQuery = admin
      .from('students')
      .select('id', {
        head: true,
        count: 'exact'
      })
      .eq('active', true);

    if (branchId) {
      studentsQuery = studentsQuery.eq(
        'branch_id',
        branchId
      );
    }

    const {
      count: activeStudents,
      error: studentsError
    } = await studentsQuery;

    if (studentsError) {
      throw studentsError;
    }

    /*
     * Consulta de asistencia del día.
     *
     * Se utiliza classes!inner para filtrar por sede.
     */
    let attendanceQuery = admin
      .from('attendance')
      .select(
        'status,classes!inner(branch_id)'
      )
      .eq('date', today);

    if (branchId) {
      attendanceQuery = attendanceQuery.eq(
        'classes.branch_id',
        branchId
      );
    }

    const {
      data: attendance,
      error: attendanceError
    } = await attendanceQuery;

    if (attendanceError) {
      throw attendanceError;
    }

    const attendanceRows = attendance || [];

    const attendedCount = attendanceRows.filter((item) => {
      return [
        'present',
        'late'
      ].includes(item.status);
    }).length;

    const attendanceRate = attendanceRows.length
      ? Math.round(
          (
            attendedCount /
            attendanceRows.length
          ) * 100
        )
      : 0;

    /*
     * El Staff no debe recibir información financiera.
     */
    let monthlyIncome = 0;
    let overdueCount = 0;

    if (req.profile.role === 'admin') {
      /*
       * Suma de pagos correspondientes al mes actual.
       */
      let paymentsQuery = admin
        .from('payments')
        .select(
          `
          amount,
          invoices!inner(
            student_id,
            students!inner(
              branch_id
            )
          )
          `
        )
        .gte(
          'paid_at',
          `${monthRange.start}T00:00:00-05:00`
        )
        .lt(
          'paid_at',
          `${monthRange.end}T00:00:00-05:00`
        );

      if (branchId) {
        paymentsQuery = paymentsQuery.eq(
          'invoices.students.branch_id',
          branchId
        );
      }

      const {
        data: payments,
        error: paymentsError
      } = await paymentsQuery;

      if (paymentsError) {
        throw paymentsError;
      }

      monthlyIncome = (payments || []).reduce(
        (total, payment) => {
          return total + Number(payment.amount || 0);
        },
        0
      );

      /*
       * Conteo de mensualidades vencidas.
       *
       * Se consideran vencidas:
       * - pending
       * - partial
       * - overdue
       *
       * Además, la fecha debe ser anterior a hoy.
       */
      let overdueQuery = admin
        .from('invoices')
        .select(
          `
          id,
          students!inner(
            branch_id
          )
          `,
          {
            head: true,
            count: 'exact'
          }
        )
        .lt('due_date', today)
        .in(
          'status',
          [
            'pending',
            'partial',
            'overdue'
          ]
        );

      if (branchId) {
        overdueQuery = overdueQuery.eq(
          'students.branch_id',
          branchId
        );
      }

      const {
        count,
        error: overdueError
      } = await overdueQuery;

      if (overdueError) {
        throw overdueError;
      }

      overdueCount = count || 0;
    }

    return res.json({
      activeStudents: activeStudents || 0,
      attendanceRate,
      attendanceCount: attendanceRows.length,
      monthlyIncome,
      overdueCount
    });
  })
);

/*
 * GET /api/dashboard/weekly-attendance
 *
 * Devuelve siete días de asistencia.
 */
router.get(
  '/weekly-attendance',
  asyncRoute(async (req, res) => {
    const branchId = getBranchId(req);

    /*
     * Se construyen las fechas basándose en America/Lima.
     */
    const todayString = getLimaDate();

    const endDate = new Date(
      `${todayString}T12:00:00-05:00`
    );

    const startDate = new Date(endDate);
    startDate.setDate(
      endDate.getDate() - 6
    );

    const startString = new Intl.DateTimeFormat(
      'en-CA',
      {
        timeZone: 'America/Lima',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }
    ).format(startDate);

    let query = admin
      .from('attendance')
      .select(
        `
        student_id,
        date,
        status,
        classes!inner(
          branch_id
        )
        `
      )
      .gte('date', startString)
      .lte('date', todayString);

    /*
     * El Alumno consulta únicamente su propia asistencia.
     */
    if (req.profile.role === 'student') {
      const {
        data: student,
        error: studentError
      } = await admin
        .from('students')
        .select('id')
        .eq('user_id', req.user.id)
        .maybeSingle();

      if (studentError) {
        throw studentError;
      }

      if (!student) {
        return res.json(
          createEmptyWeek(
            startDate
          )
        );
      }

      query = query.eq(
        'student_id',
        student.id
      );
    } else if (branchId) {
      /*
       * Administrador filtrado por sede o Staff.
       */
      query = query.eq(
        'classes.branch_id',
        branchId
      );
    }

    const {
      data,
      error
    } = await query;

    if (error) {
      throw error;
    }

    const result = {};

    /*
     * Se crean siempre los siete días, incluso cuando no
     * haya ningún registro de asistencia.
     */
    for (let index = 0; index < 7; index += 1) {
      const date = new Date(startDate);

      date.setDate(
        startDate.getDate() + index
      );

      const dateString = new Intl.DateTimeFormat(
        'en-CA',
        {
          timeZone: 'America/Lima',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        }
      ).format(date);

      result[dateString] = {
        present: 0,
        late: 0,
        absent: 0,
        justified: 0
      };
    }

    for (const row of data || []) {
      if (!result[row.date]) {
        continue;
      }

      if (
        Object.prototype.hasOwnProperty.call(
          result[row.date],
          row.status
        )
      ) {
        result[row.date][row.status] += 1;
      }
    }

    return res.json(
      Object.entries(result).map(
        ([date, values]) => ({
          date,
          ...values
        })
      )
    );
  })
);

/*
 * Crea una semana vacía para un Alumno que todavía no cuenta
 * con un registro vinculado en public.students.
 */
function createEmptyWeek(startDate) {
  const result = [];

  for (let index = 0; index < 7; index += 1) {
    const date = new Date(startDate);

    date.setDate(
      startDate.getDate() + index
    );

    const dateString = new Intl.DateTimeFormat(
      'en-CA',
      {
        timeZone: 'America/Lima',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }
    ).format(date);

    result.push({
      date: dateString,
      present: 0,
      late: 0,
      absent: 0,
      justified: 0
    });
  }

  return result;
}

/*
 * GET /api/dashboard/activity
 *
 * Devuelve la actividad reciente sin intentar hacer una relación
 * embebida inexistente entre audit_logs y profiles.
 */
router.get(
  '/activity',
  asyncRoute(async (req, res) => {
    let query = admin
      .from('audit_logs')
      .select(
        `
        id,
        actor_id,
        action,
        entity,
        entity_id,
        new_data,
        created_at
        `
      )
      .order('created_at', {
        ascending: false
      })
      .limit(20);

    /*
     * El Staff no debe recibir actividad financiera.
     */
    if (req.profile.role === 'staff') {
      query = query.not(
        'entity',
        'in',
        '(payments,invoices,payment_plans)'
      );
    }

    /*
     * El Alumno solo puede consultar actividad propia.
     */
    if (req.profile.role === 'student') {
      query = query.eq(
        'actor_id',
        req.user.id
      );
    }

    const {
      data: activityRows,
      error: activityError
    } = await query;

    if (activityError) {
      throw activityError;
    }

    const rows = activityRows || [];

    /*
     * Se consultan los nombres de los actores por separado.
     *
     * Esto evita solicitar profiles(full_name) dentro de
     * audit_logs, relación que no existe en el esquema.
     */
    const actorIds = [
      ...new Set(
        rows
          .map((item) => item.actor_id)
          .filter(Boolean)
      )
    ];

    let profileRows = [];

    if (actorIds.length > 0) {
      const {
        data: profiles,
        error: profilesError
      } = await admin
        .from('profiles')
        .select('id,full_name')
        .in('id', actorIds);

      if (profilesError) {
        /*
         * Un fallo al obtener nombres no debe bloquear
         * todo el Dashboard.
         */
        console.error({
          message:
            'No se pudieron obtener los nombres de actividad.',
          error: profilesError.message,
          requestId: req.id
        });
      } else {
        profileRows = profiles || [];
      }
    }

    const profileNames = new Map(
      profileRows.map((profile) => [
        profile.id,
        profile.full_name
      ])
    );

    const response = rows.map((item) => ({
      ...item,
      actor_name:
        profileNames.get(item.actor_id) ||
        'Usuario del sistema'
    }));

    return res.json(response);
  })
);

/*
 * Validación de gráficas personalizadas.
 */
const widgetCreateSchema = Joi.object({
  title: Joi
    .string()
    .trim()
    .max(80)
    .required(),

  metric: Joi
    .string()
    .valid(
      'attendance',
      'active_students',
      'income',
      'overdue',
      'new_students'
    )
    .required(),

  chart_type: Joi
    .string()
    .valid(
      'bar',
      'line',
      'doughnut',
      'number'
    )
    .required(),

  filters: Joi
    .object()
    .default({}),

  position: Joi
    .number()
    .integer()
    .min(0)
    .default(0),

  size: Joi
    .string()
    .valid(
      'small',
      'medium',
      'large'
    )
    .default('medium'),

  color: Joi
    .string()
    .pattern(
      /^#[0-9A-Fa-f]{6}$/
    )
    .default('#2867ee'),

  active: Joi
    .boolean()
    .default(true)
});

/*
 * La actualización permite modificar solo algunos campos.
 */
const widgetUpdateSchema = Joi.object({
  title: Joi
    .string()
    .trim()
    .max(80),

  metric: Joi
    .string()
    .valid(
      'attendance',
      'active_students',
      'income',
      'overdue',
      'new_students'
    ),

  chart_type: Joi
    .string()
    .valid(
      'bar',
      'line',
      'doughnut',
      'number'
    ),

  filters: Joi.object(),

  position: Joi
    .number()
    .integer()
    .min(0),

  size: Joi
    .string()
    .valid(
      'small',
      'medium',
      'large'
    ),

  color: Joi
    .string()
    .pattern(
      /^#[0-9A-Fa-f]{6}$/
    ),

  active: Joi.boolean()
})
  .min(1);

/*
 * GET /api/dashboard/widgets
 *
 * Cada usuario consulta solamente sus propias gráficas.
 */
router.get(
  '/widgets',
  asyncRoute(async (req, res) => {
    const {
      data,
      error
    } = await admin
      .from('dashboard_widgets')
      .select('*')
      .eq(
        'profile_id',
        req.user.id
      )
      .eq('active', true)
      .order('position', {
        ascending: true
      })
      .order('created_at', {
        ascending: true
      });

    if (error) {
      throw error;
    }

    return res.json(data || []);
  })
);

/*
 * POST /api/dashboard/widgets
 *
 * Solo el Administrador puede crear gráficas personalizadas.
 */
router.post(
  '/widgets',
  allow('admin'),
  validate(widgetCreateSchema),
  asyncRoute(async (req, res) => {
    const {
      data,
      error
    } = await admin
      .from('dashboard_widgets')
      .insert({
        ...req.body,
        profile_id: req.user.id
      })
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    await audit(
      req,
      'create',
      'dashboard_widgets',
      data.id,
      null,
      data
    );

    return res.status(201).json(data);
  })
);

/*
 * PATCH /api/dashboard/widgets/:id
 *
 * Solo se puede modificar una gráfica perteneciente al
 * Administrador autenticado.
 */
router.patch(
  '/widgets/:id',
  allow('admin'),
  validate(widgetUpdateSchema),
  asyncRoute(async (req, res) => {
    const {
      data: existingWidget,
      error: existingError
    } = await admin
      .from('dashboard_widgets')
      .select('*')
      .eq('id', req.params.id)
      .eq(
        'profile_id',
        req.user.id
      )
      .maybeSingle();

    if (existingError) {
      throw existingError;
    }

    if (!existingWidget) {
      throw appError(
        404,
        'GRAFICA_NO_ENCONTRADA'
      );
    }

    const {
      data,
      error
    } = await admin
      .from('dashboard_widgets')
      .update(req.body)
      .eq('id', req.params.id)
      .eq(
        'profile_id',
        req.user.id
      )
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    await audit(
      req,
      'update',
      'dashboard_widgets',
      data.id,
      existingWidget,
      data
    );

    return res.json(data);
  })
);

/*
 * DELETE /api/dashboard/widgets/:id
 *
 * Se aplica una eliminación lógica para conservar trazabilidad.
 */
router.delete(
  '/widgets/:id',
  allow('admin'),
  asyncRoute(async (req, res) => {
    const {
      data: existingWidget,
      error: existingError
    } = await admin
      .from('dashboard_widgets')
      .select('*')
      .eq('id', req.params.id)
      .eq(
        'profile_id',
        req.user.id
      )
      .maybeSingle();

    if (existingError) {
      throw existingError;
    }

    if (!existingWidget) {
      throw appError(
        404,
        'GRAFICA_NO_ENCONTRADA'
      );
    }

    const {
      error
    } = await admin
      .from('dashboard_widgets')
      .update({
        active: false
      })
      .eq('id', req.params.id)
      .eq(
        'profile_id',
        req.user.id
      );

    if (error) {
      throw error;
    }

    await audit(
      req,
      'disable',
      'dashboard_widgets',
      existingWidget.id,
      existingWidget,
      {
        ...existingWidget,
        active: false
      }
    );

    return res.status(204).end();
  })
);

export default router;