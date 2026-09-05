import express from 'express';
import { admin } from '../db.js';  // ← CAMBIADO: usar 'admin' en lugar de 'supabaseAdmin'
import { authenticate, requireAdmin } from '../middleware/auth.js';
import { asyncRoute, appError } from '../utils.js';
import { audit } from '../services/audit.js';
import Joi from 'joi';
import crypto from 'crypto';

const router = express.Router();

// Esquemas de validación
const createUserSchema = Joi.object({
  username: Joi.string().pattern(/^[a-z0-9._-]{4,32}$/).required()
    .messages({ 'string.pattern.base': 'Username debe tener 4-32 caracteres, solo letras minúsculas, números, punto, guion y guion bajo' }),
  fullName: Joi.string().min(2).max(100).required(),
  role: Joi.string().valid('admin', 'staff', 'student').required(),
  branchId: Joi.string().uuid().allow(null),
  password: Joi.string().min(8).required(),
  studentId: Joi.string().uuid().allow(null),
  status: Joi.string().valid('active', 'inactive').default('active'),
  mustChangePassword: Joi.boolean().default(true)
});

const updateUserSchema = Joi.object({
  fullName: Joi.string().min(2).max(100),
  role: Joi.string().valid('admin', 'staff', 'student'),
  branchId: Joi.string().uuid().allow(null),
  status: Joi.string().valid('active', 'inactive'),
  studentId: Joi.string().uuid().allow(null),
  mustChangePassword: Joi.boolean()
});

// GET /api/users - Listar usuarios
router.get('/', authenticate, requireAdmin, asyncRoute(async (req, res) => {
  const { search, role, status, branchId } = req.query;

  let query = admin  // ← CAMBIADO: usar 'admin' en lugar de 'supabaseAdmin'
    .from('profiles')
    .select(`
      id,
      full_name,
      username,
      role,
      branch_id,
      status,
      must_change_password,
      last_login_at,
      created_at,
      created_by,
      student_id,
      students:student_id(full_name, document)
    `);

  if (search) {
    query = query.or(`full_name.ilike.%${search}%,username.ilike.%${search}%`);
  }
  if (role) query = query.eq('role', role);
  if (status) query = query.eq('status', status);
  if (branchId) query = query.eq('branch_id', branchId);

  const { data, error } = await query.order('created_at', { ascending: false });

  if (error) throw appError(500, 'ERROR_AL_OBTENER_USUARIOS');

  const { count: adminCount } = await admin  // ← CAMBIADO
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'admin')
    .eq('status', 'active');

  res.json({ data, meta: { total: data.length, active_admins: adminCount } });
}));

// POST /api/users - Crear usuario
router.post('/', authenticate, requireAdmin, asyncRoute(async (req, res) => {
  const { error, value } = createUserSchema.validate(req.body);
  if (error) throw appError(400, error.details[0].message);

  const { username, fullName, role, branchId, password, studentId, status, mustChangePassword } = value;

  const { data: existingUser } = await admin  // ← CAMBIADO
    .from('profiles')
    .select('id')
    .ilike('username', username)
    .maybeSingle();

  if (existingUser) {
    throw appError(409, 'El username ya está en uso');
  }

  const technicalEmail = `${username}@users.araacademy.invalid`;

  const { data: authUser, error: authError } = await admin.auth.admin.createUser({  // ← CAMBIADO: 'admin.auth.admin'
    email: technicalEmail,
    password: password,
    email_confirm: true,
    user_metadata: {
      username: username,
      full_name: fullName,
      role: role,
      branch_id: branchId,
      student_id: studentId,
      status: status,
      must_change_password: mustChangePassword
    }
  });

  if (authError) {
    console.error('Error creating user:', authError);
    throw appError(500, `Error al crear usuario: ${authError.message}`);
  }

  await audit(req.user.id, 'USER_CREATED', 'users', authUser.user.id, {
    username, fullName, role, branchId, studentId
  });

  res.status(201).json({ message: 'Usuario creado exitosamente', userId: authUser.user.id });
}));

// GET /api/users/:id - Obtener un usuario
router.get('/:id', authenticate, requireAdmin, asyncRoute(async (req, res) => {
  const { id } = req.params;

  const { data, error } = await admin  // ← CAMBIADO
    .from('profiles')
    .select(`
      *,
      students:student_id(full_name, document)
    `)
    .eq('id', id)
    .single();

  if (error) throw appError(404, 'Usuario no encontrado');
  res.json(data);
}));

// PATCH /api/users/:id - Actualizar usuario
router.patch('/:id', authenticate, requireAdmin, asyncRoute(async (req, res) => {
  const { id } = req.params;
  const { error, value } = updateUserSchema.validate(req.body);
  if (error) throw appError(400, error.details[0].message);

  if (value.status === 'inactive') {
    const { data: userToUpdate } = await admin  // ← CAMBIADO
      .from('profiles')
      .select('role')
      .eq('id', id)
      .single();

    if (userToUpdate?.role === 'admin') {
      const { count } = await admin  // ← CAMBIADO
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'admin')
        .eq('status', 'active');

      if (count <= 1) {
        throw appError(400, 'No se puede deshabilitar al único administrador activo');
      }
    }
  }

  const { data, error: updateError } = await admin  // ← CAMBIADO
    .from('profiles')
    .update(value)
    .eq('id', id)
    .select();

  if (updateError) throw appError(500, 'Error al actualizar usuario');

  await audit(req.user.id, 'USER_UPDATED', 'users', id, value);
  res.json({ message: 'Usuario actualizado exitosamente' });
}));

// POST /api/users/:id/reset-password - Restablecer contraseña
router.post('/:id/reset-password', authenticate, requireAdmin, asyncRoute(async (req, res) => {
  const { id } = req.params;
  const { newPassword } = req.body;

  if (!newPassword || newPassword.length < 8) {
    throw appError(400, 'La nueva contraseña debe tener al menos 8 caracteres');
  }

  const { error: updateError } = await admin.auth.admin.updateUserById(id, {  // ← CAMBIADO
    password: newPassword
  });

  if (updateError) throw appError(500, 'Error al restablecer contraseña');

  await admin  // ← CAMBIADO
    .from('profiles')
    .update({ must_change_password: true })
    .eq('id', id);

  await audit(req.user.id, 'PASSWORD_RESET', 'users', id, { reset_by: req.user.id });

  res.json({ message: 'Contraseña restablecida exitosamente. El usuario deberá cambiarla en su próximo inicio de sesión.' });
}));

// POST /api/users/:id/revoke-sessions - Revocar sesiones
router.post('/:id/revoke-sessions', authenticate, requireAdmin, asyncRoute(async (req, res) => {
  const { id } = req.params;

  const tempPassword = crypto.randomBytes(16).toString('hex');
  await admin.auth.admin.updateUserById(id, { password: tempPassword });  // ← CAMBIADO
  await admin  // ← CAMBIADO
    .from('profiles')
    .update({ must_change_password: true })
    .eq('id', id);

  await audit(req.user.id, 'SESSIONS_REVOKED', 'users', id, { revoked_by: req.user.id });

  res.json({ message: 'Sesiones revocadas exitosamente.' });
}));

// DELETE /api/users/:id - Eliminar usuario
router.delete('/:id', authenticate, requireAdmin, asyncRoute(async (req, res) => {
  const { id } = req.params;

  const { data: auditLogs } = await admin  // ← CAMBIADO
    .from('audit_logs')
    .select('id')
    .eq('actor_id', id)
    .limit(1);

  if (auditLogs && auditLogs.length > 0) {
    throw appError(409, 'No se puede eliminar un usuario con historial. Considere deshabilitarlo.');
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(id);  // ← CAMBIADO
  if (deleteError) throw appError(500, 'Error al eliminar usuario');

  await audit(req.user.id, 'USER_DELETED', 'users', id, { deleted_by: req.user.id });

  res.json({ message: 'Usuario eliminado exitosamente' });
}));

export default router;