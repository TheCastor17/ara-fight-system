import React from'react';import{X,LoaderCircle}from'lucide-react';
export function Modal({title,onClose,children,wide=false}){return <div className="modal-backdrop" onMouseDown={onClose}><section className={`modal ${wide?'wide':''}`} onMouseDown={e=>e.stopPropagation()}><header><h2>{title}</h2><button className="icon-btn" onClick={onClose}><X size={19}/></button></header>{children}</section></div>}
export function Loading({text='Cargando...'}){return <div className="loading"><LoaderCircle className="spin"/> {text}</div>}
export function Empty({text='No existen registros.'}){return <div className="empty">{text}</div>}
export function Field({label,children,full=false}){return <label className={`field ${full?'full':''}`}><span>{label}</span>{children}</label>}
export function Toast({message}){return message?<div className="toast">✓ {message}</div>:null}
export const money=n=>new Intl.NumberFormat('es-PE',{style:'currency',currency:'PEN'}).format(Number(n||0));export const date=v=>v?new Intl.DateTimeFormat('es-PE',{timeZone:'UTC'}).format(new Date(v)): '—';
