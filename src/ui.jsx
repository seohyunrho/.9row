import React, {useEffect,useRef,createContext,useContext} from 'react';
import {Info,Sprout,X} from 'lucide-react';
export const OfficeContext = createContext(null);
export const useOffice = () => useContext(OfficeContext);
export const uid = () => crypto.randomUUID();
export const now = () => new Date().toISOString();
export const dateToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
export const dayLeft = date => date ? Math.round((new Date(`${date}T00:00:00+09:00`) - new Date(`${dateToday()}T00:00:00+09:00`)) / 86400000) : null;
export const dueLabel = date => { const n = dayLeft(date); return n === null ? '마감일 미정' : n < 0 ? '마감' : n === 0 ? '오늘 마감' : `D-${n}`; };
export const formatDate = date => date ? new Intl.DateTimeFormat('ko-KR', {month:'long',day:'numeric',timeZone:'Asia/Seoul'}).format(new Date(`${date.slice(0,10)}T12:00:00+09:00`)) : '미정';
export const safeUrl = value => /^https?:\/\//i.test(value || '') ? value : null;
export function IconButton({children,label,...props}) { return <button className="icon-button" aria-label={label} title={label} {...props}>{children}</button>; }
export function Notice({children}) { return <div className="notice"><Info size={17} aria-hidden="true"/><span>{children}</span></div>; }
export function Empty({icon:Icon=Sprout,title,children,action}) { return <div className="empty"><span className="empty-icon"><Icon size={28}/></span><h3>{title}</h3><p>{children}</p>{action}</div>; }
export function PageHeading({eyebrow,title,description,action}) { return <div className="page-heading"><div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h1>{title}</h1><p>{description}</p></div>{action}</div>; }
export function Modal({title,children,onClose,wide=false}) {
  const ref=useRef(null);
  useEffect(()=>{const d=ref.current;d.showModal();return()=>d.close();},[]);
  return <dialog ref={ref} className={`modal ${wide?'wide':''}`} onCancel={e=>{e.preventDefault();onClose();}} onClick={e=>{if(e.target===e.currentTarget)onClose();}}><div className="modal-head"><h2>{title}</h2><IconButton label="닫기" onClick={onClose}><X size={20}/></IconButton></div>{children}</dialog>;
}
export function Field({label,children,hint}) { return <label className="field"><span>{label}</span>{children}{hint&&<small>{hint}</small>}</label>; }
export function Avatar({type='cat',size=40}) { return <span className={`portrait ${type}`} style={{width:size,height:size}} aria-hidden="true"/>; }
export function CompanyMark({job}) { return <span className={`company-mark ${job.color || 'green'}`}>{job.company.slice(0,1)}</span>; }

