import crypto from 'node:crypto'; import sanitizeHtml from 'sanitize-html';
export const clean=v=>typeof v==='string'?sanitizeHtml(v,{allowedTags:[],allowedAttributes:{}}).trim():v;
export const hash=v=>crypto.createHash('sha256').update(v).digest('hex');
export const timingSafe=(a,b)=>{const x=Buffer.from(a||''),y=Buffer.from(b||'');return x.length===y.length&&crypto.timingSafeEqual(x,y)};
export const safeUser=u=>({id:u.id,email:u.email});
