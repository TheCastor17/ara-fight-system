import { Router } from 'express';
import Joi from 'joi';

import { admin } from '../db.js';
import {
  authenticate,
  allow,
  branchScope
} from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  asyncRoute,
  cleanObject,
  parsePage,
  randomToken,
  sha,
  appError
} from '../utils.js';
import { config } from '../config.js';
import { audit } from '../services/audit.js';

const router = Router();

router.use(authenticate);

const studentSchema = Joi.object({
  first_name: Joi.string().trim().max(80).required(),
  last_name: Joi.string().trim().max(80).required(),
  document: Joi.string().trim().max(30).allow('', null),
  birth_date: Joi.date().iso().allow(null),
  phone: Joi.string().trim().max(20).allow('', null),
  email: Joi.string().trim().email().allow('', null),
  address: Joi.string().trim().max(300).allow('', null),
  guardian_name: Joi.string().trim().max(160).allow('', null),
  guardian_document: Joi.string().trim().max(30).allow('', null),
  guardian_relationship: Joi.string().trim().max(40).allow('', null),
  guardian_phone: Joi.string().trim().max(20).allow('', null),
  guardian_email: Joi.string().trim().email().allow('', null),
  branch_id: Joi.string().uuid().required(),
  plan_id: Joi.string().uuid().allow(null, ''),
  payment_day: Joi.number().integer().min(1).max(31).required(),
  discount: Joi.number().min(0).precision(2).default(0),
  enrollment_date: Joi.date()
    .iso()
    .default(() => new Date().toISOString().slice(0, 10)),
  class_ids: Joi.array().items(Joi.string().uuid()).max(20).default([])
});

const statusSchema = Joi.object({
  active: Joi.boolean().required()
});

const registrationLinkSchema = Joi.object({
  branch_id: Joi.string().uuid().required(),
  expires_hours: Joi.number().integer().min(1).max(168).default(72)
});

function normalizeNullableFields(payload) {
  const nullableFields = [
    'document',
    'phone',
    'email',
    'address',
    'guardian_name',
    'guardian_document',
    'guardian_relationship',
    'guardian_phone',
    'guardian_email',
    'plan_id',
    'birth_date'
  ];

  for (const field of nullableFields) {
    if (payload[field] === '') {
      payload[field] = null;
    }
  }

  return payload;
}

async function getStudentOrFail(studentId) {
  const { data, error } = await admin
    .from('students')
    .select('*')
    .eq('id', studentId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    throw appError(404, 'ALUMNO_NO_ENCONTRADO');
  }

  return data;
}

function assertStaffBranch(req, branchId) {
  if (
    req.profile.role === 'staff' &&
    branchId !== req.profile.branch_id
  ) {
    throw appError(403, 'SEDE_NO_AUTORIZADA');
  }
}

async function replaceEnrollments(studentId, classIds, branchId) {
  if (!Array.isArray(classIds)) {
    return;
  }

  if (classIds.length > 0) {
    const { data: validClasses, error: classesError } = await admin
      .from('classes')
      .select('id,branch_id,active')
      .in('id', classIds);

    if (classesError) {
      throw classesError;
    }

    const validMap = new Map(
      (validClasses || []).map((classItem) => [classItem.id, classItem])
    );

    const invalidClassIds = classIds.filter((classId) => {
      const classItem = validMap.get(classId);
      return !classItem || !classItem.active || classItem.branch_id !== branchId;
    });

    if (invalidClassIds.length > 0) {
      throw appError(400, 'CLASE_NO_VALIDA_PARA_LA_SEDE', {
        class_ids: invalidClassIds
      });
    }
  }

  const { error: deleteError } = await admin
    .from('enrollments')
    .delete()
    .eq('student_id', studentId);

  if (deleteError) {
    throw deleteError;
  }

  if (classIds.length > 0) {
    const { error: insertError } = await admin
      .from('enrollments')
      .insert(
        classIds.map((classId) => ({
          student_id: studentId,
          class_id: classId,
          active: true
        }))
      );

    if (insertError) {
      throw insertError;
    }
  }
}

async function createInitialInvoice(student) {
  if (!student.plan_id) {
    return;
  }

  const { data: plan, error: planError } = await admin
    .from('payment_plans')
    .select('id,price,active')
    .eq('id', student.plan_id)
    .maybeSingle();

  if (planError) {
    throw planError;
  }

  if (!plan || !plan.active) {
    throw appError(400, 'PLAN_NO_DISPONIBLE');
  }

  const now = new Date();
  const year = now.getFullYear();
  const monthIndex = now.getMonth();
  const month = String(monthIndex + 1).padStart(2, '0');
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  const dueDay = Math.min(Number(student.payment_day), lastDay);
  const dueDate = `${year}-${month}-${String(dueDay).padStart(2, '0')}`;
  const period = `${year}-${month}-01`;
  const amount = Math.max(
    Number(plan.price) - Number(student.discount || 0),
    0
  );

  const { error } = await admin
    .from('invoices')
    .upsert(
      {
        student_id: student.id,
        period,
        due_date: dueDate,
        amount,
        status: 'pending'
      },
      {
        onConflict: 'student_id,period',
        ignoreDuplicates: true
      }
    );

  if (error) {
    throw error;
  }
}

router.get(
  '/',
  allow('admin', 'staff'),
  branchScope,
  asyncRoute(async (req, res) => {
    const { limit, offset } = parsePage(req);

    let query = admin
      .from('student_overview')
      .select('*', { count: 'exact' })
      .range(offset, offset + limit - 1)
      .order('created_at', { ascending: false });

    if (req.query.branch_id) {
      query = query.eq('branch_id', req.query.branch_id);
    }

    if (req.query.search) {
      const search = String(req.query.search)
        .replace(/[,%()]/g, '')
        .trim();

      if (search) {
        query = query.or(
          `first_name.ilike.%${search}%,last_name.ilike.%${search}%,document.ilike.%${search}%`
        );
      }
    }

    if (req.query.active === 'true' || req.query.active === 'false') {
      query = query.eq('active', req.query.active === 'true');
    }

    const { data, count, error } = await query;

    if (error) {
      throw error;
    }

    return res.json({
      data: data || [],
      total: count || 0,
      limit,
      offset
    });
  })
);

router.get(
  '/me',
  allow('student'),
  asyncRoute(async (req, res) => {
    const { data, error } = await admin
      .from('student_overview')
      .select('*')
      .eq('user_id', req.user.id)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      throw appError(404, 'ALUMNO_NO_VINCULADO');
    }

    return res.json(data);
  })
);

router.post(
  '/registration-links/create',
  allow('admin', 'staff'),
  validate(registrationLinkSchema),
  asyncRoute(async (req, res) => {
    assertStaffBranch(req, req.body.branch_id);

    const { data: branch, error: branchError } = await admin
      .from('branches')
      .select('id,active')
      .eq('id', req.body.branch_id)
      .maybeSingle();

    if (branchError) {
      throw branchError;
    }

    if (!branch || !branch.active) {
      throw appError(400, 'SEDE_NO_DISPONIBLE');
    }

    const token = randomToken();
    const expiresAt = new Date(
      Date.now() + req.body.expires_hours * 60 * 60 * 1000
    ).toISOString();

    const { data, error } = await admin
      .from('registration_links')
      .insert({
        token_hash: sha(token),
        branch_id: req.body.branch_id,
        created_by: req.user.id,
        expires_at: expiresAt
      })
      .select('id,expires_at')
      .single();

    if (error) {
      throw error;
    }

    await audit(
      req,
      'create',
      'registration_links',
      data.id,
      null,
      {
        branch_id: req.body.branch_id,
        expires_at: data.expires_at
      }
    );

    return res.status(201).json({
      ...data,
      url: `${config.registrationUrl}/${token}`
    });
  })
);

router.get(
  '/:id',
  allow('admin', 'staff'),
  asyncRoute(async (req, res) => {
    const { data: student, error } = await admin
      .from('student_overview')
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!student) {
      throw appError(404, 'ALUMNO_NO_ENCONTRADO');
    }

    assertStaffBranch(req, student.branch_id);

    const classesPromise = admin
      .from('enrollments')
      .select(
        `
        id,
        student_id,
        class_id,
        active,
        created_at,
        classes(
          id,
          name,
          branch_id,
          discipline_id,
          weekdays,
          start_time,
          duration_minutes,
          capacity,
          active
        )
        `
      )
      .eq('student_id', student.id)
      .order('created_at', { ascending: false });

    const attendancePromise = admin
      .from('attendance')
      .select(
        `
        id,
        class_id,
        date,
        status,
        notes,
        created_at,
        classes(name)
        `
      )
      .eq('student_id', student.id)
      .order('date', { ascending: false })
      .limit(100);

    const invoicesPromise = req.profile.role === 'admin'
      ? admin
          .from('payment_overview')
          .select('*')
          .eq('student_id', student.id)
          .order('due_date', { ascending: false })
      : Promise.resolve({ data: [], error: null });

    const [classesResult, attendanceResult, invoicesResult] =
      await Promise.all([
        classesPromise,
        attendancePromise,
        invoicesPromise
      ]);

    if (classesResult.error) throw classesResult.error;
    if (attendanceResult.error) throw attendanceResult.error;
    if (invoicesResult.error) throw invoicesResult.error;

    return res.json({
      ...student,
      classes: classesResult.data || [],
      attendance: attendanceResult.data || [],
      invoices: invoicesResult.data || []
    });
  })
);

router.post(
  '/',
  allow('admin', 'staff'),
  branchScope,
  validate(studentSchema),
  asyncRoute(async (req, res) => {
    const { class_ids: classIds, ...studentInput } = cleanObject(req.body);
    const payload = normalizeNullableFields(studentInput);

    assertStaffBranch(req, payload.branch_id);

    const { data: student, error } = await admin
      .from('students')
      .insert(payload)
      .select('*')
      .single();

    if (error?.code === '23505') {
      throw appError(409, 'ALUMNO_DUPLICADO');
    }

    if (error) {
      throw error;
    }

    try {
      await replaceEnrollments(
        student.id,
        Array.isArray(classIds) ? classIds : [],
        student.branch_id
      );

      await createInitialInvoice(student);
    } catch (relatedError) {
      await admin.from('enrollments').delete().eq('student_id', student.id);
      await admin.from('invoices').delete().eq('student_id', student.id);
      await admin.from('students').delete().eq('id', student.id);
      throw relatedError;
    }

    await audit(req, 'create', 'students', student.id, null, student);

    return res.status(201).json(student);
  })
);

router.patch(
  '/:id',
  allow('admin', 'staff'),
  validate(studentSchema),
  asyncRoute(async (req, res) => {
    const original = await getStudentOrFail(req.params.id);
    assertStaffBranch(req, original.branch_id);

    const { class_ids: classIds, ...studentInput } = cleanObject(req.body);
    const payload = normalizeNullableFields(studentInput);

    assertStaffBranch(req, payload.branch_id);

    const { data: updated, error } = await admin
      .from('students')
      .update(payload)
      .eq('id', req.params.id)
      .select('*')
      .single();

    if (error?.code === '23505') {
      throw appError(409, 'ALUMNO_DUPLICADO');
    }

    if (error) {
      throw error;
    }

    await replaceEnrollments(
      updated.id,
      Array.isArray(classIds) ? classIds : [],
      updated.branch_id
    );

    await audit(
      req,
      'update',
      'students',
      updated.id,
      original,
      updated
    );

    return res.json(updated);
  })
);

router.patch(
  '/:id/status',
  allow('admin'),
  validate(statusSchema),
  asyncRoute(async (req, res) => {
    const original = await getStudentOrFail(req.params.id);

    const { data: updated, error } = await admin
      .from('students')
      .update({ active: req.body.active })
      .eq('id', req.params.id)
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    await audit(
      req,
      req.body.active ? 'enable' : 'disable',
      'students',
      updated.id,
      original,
      updated
    );

    return res.json(updated);
  })
);

router.delete(
  '/:id',
  allow('admin'),
  asyncRoute(async (req, res) => {
    const student = await getStudentOrFail(req.params.id);

    const [attendanceResult, invoiceResult, notificationResult] =
      await Promise.all([
        admin
          .from('attendance')
          .select('id', { head: true, count: 'exact' })
          .eq('student_id', student.id),
        admin
          .from('invoices')
          .select('id', { head: true, count: 'exact' })
          .eq('student_id', student.id),
        admin
          .from('notification_logs')
          .select('id', { head: true, count: 'exact' })
          .eq('student_id', student.id)
      ]);

    if (attendanceResult.error) throw attendanceResult.error;
    if (invoiceResult.error) throw invoiceResult.error;
    if (notificationResult.error) throw notificationResult.error;

    const hasHistory =
      (attendanceResult.count || 0) > 0 ||
      (invoiceResult.count || 0) > 0 ||
      (notificationResult.count || 0) > 0;

    if (hasHistory) {
      throw appError(
        409,
        'ALUMNO_CON_HISTORIAL_USE_DESHABILITAR',
        'El alumno posee historial académico o financiero.'
      );
    }

    const { error: enrollmentDeleteError } = await admin
      .from('enrollments')
      .delete()
      .eq('student_id', student.id);

    if (enrollmentDeleteError) {
      throw enrollmentDeleteError;
    }

    const { error: studentDeleteError } = await admin
      .from('students')
      .delete()
      .eq('id', student.id);

    if (studentDeleteError) {
      throw studentDeleteError;
    }

    await audit(req, 'delete', 'students', student.id, student, null);

    return res.status(204).end();
  })
);

export default router;
