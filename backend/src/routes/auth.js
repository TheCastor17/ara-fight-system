import {Router} from 'express';
import Joi from 'joi';
import {publicClient, admin} from '../db.js';
import {validate} from '../middleware/validate.js';
import {authenticate} from '../middleware/auth.js';
import {asyncRoute, normalizeEmail, appError} from '../utils.js';
import {status, record} from '../services/login.js';

const router = Router();

const loginSchema = Joi.object({
  email: Joi.string().email().max(254).required(),
  password: Joi.string().min(8).max(128).required()
});

router.post('/login', validate(loginSchema), asyncRoute(async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const state = await status(email, req.ip);
  if (!state.allowed) throw appError(429, 'DEMASIADOS_INTENTOS', { retryAfterMinutes: 15 });
  
  const {data, error} = await publicClient.auth.signInWithPassword({
    email,
    password: req.body.password
  });
  
  await record(email, req.ip, !error, req.get('user-agent'));
  if (error) throw appError(401, 'CREDENCIALES_INVALIDAS', { remaining: Math.max(state.remaining - 1, 0) });
  
  const {data: profile} = await admin.from('profiles').select('id,role,full_name,active,branch_id').eq('id', data.user.id).maybeSingle();
  if (!profile?.active) throw appError(403, 'PERFIL_INACTIVO_O_INEXISTENTE');
  
  res.json({
    session: {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_at: data.session.expires_at
    },
    user: {
      id: data.user.id,
      email: data.user.email,
      role: profile.role,
      fullName: profile.full_name,
      branch_id: profile.branch_id
    }
  });
}));

router.post('/refresh', asyncRoute(async (req, res) => {
  const {data, error} = await publicClient.auth.refreshSession({
    refresh_token: req.body.refresh_token
  });
  if (error) throw appError(401, 'REFRESH_INVALIDO');
  res.json({session: data.session});
}));

router.post('/logout', authenticate, asyncRoute(async (req, res) => {
  await admin.auth.admin.signOut(req.token, 'local');
  res.status(204).end();
}));

export default router;