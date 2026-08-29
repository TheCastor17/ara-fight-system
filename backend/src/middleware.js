import {admin} from './supabase.js';
export async function auth(req,res,next){const t=req.headers.authorization?.replace(/^Bearer\s+/i,'');if(!t)return res.status(401).json({error:'NO_AUTORIZADO'});const {data,error}=await admin.auth.getUser(t);if(error||!data.user)return res.status(401).json({error:'SESION_INVALIDA'});const {data:p}=await admin.from('profiles').select('id,role,branch_id,active').eq('id',data.user.id).single();if(!p?.active)return res.status(403).json({error:'CUENTA_INACTIVA'});req.user=data.user;req.profile=p;next()}
export const roles=(...allowed)=>(req,res,next)=>allowed.includes(req.profile?.role)?next():res.status(403).json({error:'SIN_PERMISO'});
export const asyncRoute=fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);
