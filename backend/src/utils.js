import crypto from 'node:crypto';import sanitizeHtml from 'sanitize-html';
export const clean=v=>typeof v==='string'?sanitizeHtml(v,{allowedTags:[],allowedAttributes:{}}).trim():v;
export const cleanObject=o=>Object.fromEntries(Object.entries(o).map(([k,v])=>[k,Array.isArray(v)?v.map(clean):clean(v)]));
export const sha=v=>crypto.createHash('sha256').update(String(v)).digest('hex');
export const randomToken=()=>crypto.randomBytes(32).toString('base64url');
export const normalizeEmail=v=>String(v||'').normalize('NFKC').trim().toLowerCase();
export const normalizePhone=v=>String(v||'').replace(/[^0-9+]/g,'');
export const asyncRoute=fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);
export function appError(status,code,detail){const e=new Error(code);e.status=status;e.code=code;e.detail=detail;return e}
export function parsePage(req){return{limit:Math.min(Math.max(Number(req.query.limit)||25,1),100),offset:Math.max(Number(req.query.offset)||0,0)}}
