import React,{useState,useRef,useEffect} from 'react';
import {GraduationCap,Award,FolderKanban,Globe,Plus,Save,Undo2,X,Check} from 'lucide-react';
import {Field,uid} from './ui.jsx';
import {blankProfileRecord,profileErrors,profileSections} from '../lib/profile.mjs';
import './profile.css';

const icons={educations:GraduationCap,certifications:Award,projects:FolderKanban,overseas:Globe};
export function ProfileEditor({profile,onChange,onSave,busy,dirty}) {
  const [active,setActive]=useState('educations');
  const [errors,setErrors]=useState({});
  const [removed,setRemoved]=useState(null);
  const formRef=useRef(null);const focusError=useRef(false);
  useEffect(()=>{if(!focusError.current)return;focusError.current=false;const field=formRef.current?.querySelector('[aria-invalid="true"]');if(!field)return;const details=field.closest('details');if(details)details.open=true;field.focus();},[errors]);
  const section=profileSections.find(s=>s.key===active);
  const Icon=icons[active];
  const change=(value)=>onChange({...value,confirmed:false});
  const add=()=>{const id=uid();change({...profile,[active]:[...profile[active],blankProfileRecord(active,id)]});};
  const update=(id,key,value)=>{change({...profile,[active]:profile[active].map(r=>r.id===id?{...r,[key]:value}:r)});setErrors(previous=>{const next={...previous};delete next[`${active}.${id}.${key}`];return next;});};
  const remove=(record,index)=>{setRemoved({section:active,record,index});change({...profile,[active]:profile[active].filter(r=>r.id!==record.id)});setErrors({});};
  const undo=()=>{const rows=[...profile[removed.section]];rows.splice(removed.index,0,removed.record);change({...profile,[removed.section]:rows});setActive(removed.section);setRemoved(null);};
  const save=async e=>{
    e.preventDefault();const issues=profileErrors(profile);focusError.current=Object.keys(issues).length>0;setErrors(issues);
    if(Object.keys(issues).length){setActive(Object.keys(issues)[0].split('.')[0]);return;}
    if(await onSave())setRemoved(null);
  };
  const renderField=(record,f)=>{
    const id=`profile-${active}-${record.id}-${f.key}`;
    const error=errors[`${active}.${record.id}.${f.key}`];
    const props={id,value:record[f.key]??'',onChange:e=>update(record.id,f.key,e.target.value),required:f.required,'aria-invalid':!!error,'aria-describedby':error?`${id}-error`:f.hint?`${id}-hint`:undefined,placeholder:f.placeholder,disabled:busy};
    return <div className={`profile-field ${f.type==='textarea'?'wide':''}`} key={f.key}>
      <label htmlFor={id}>{f.label}{f.required&&<span className="profile-required">필수</span>}</label>
      {f.type==='textarea'?<textarea {...props} rows={3} maxLength={20000}/>:f.type==='select'?<select {...props}><option value="">선택하지 않음</option>{f.options.map(o=><option key={o}>{o}</option>)}</select>:<input {...props} type={f.type} min={f.type==='number'?'0':undefined} step={f.type==='number'?'any':undefined} maxLength={1000}/>}
      {error?<small id={`${id}-error`} className="profile-error" role="alert">{error}</small>:f.hint&&<small id={`${id}-hint`}>{f.hint}</small>}
    </div>;
  };
  return <form className="profile-editor" ref={formRef} onSubmit={save} noValidate>
    <div className="profile-intro"><span className="profile-intro-icon"><GraduationCap size={25}/></span><div><h2>지원서에 꺼내 쓸 내 이력</h2><p>필요한 항목부터 채워두세요. 모르는 정보는 비워둘 수 있어요.</p></div></div>
    <div className="profile-categories" aria-label="기본 정보 분류">{profileSections.map(s=>{const CategoryIcon=icons[s.key];return <button type="button" key={s.key} className={active===s.key?'selected':''} aria-pressed={active===s.key} onClick={()=>setActive(s.key)}><CategoryIcon size={19}/><span>{s.label}</span><small>{profile[s.key].length}</small></button>;})}</div>
    <section className="profile-section card" aria-label={`${section.label} 입력`}>
      <div className="profile-section-heading"><div><div className="profile-section-title"><Icon size={20}/><h3>{section.label}</h3><span className="pill">{profile[active].length}건</span></div><p>{section.description}</p></div><button type="button" className="button soft" onClick={add} disabled={busy}><Plus size={16}/>{section.singular} 추가</button></div>
      {errors[active]&&<p role="alert" className="profile-error">{errors[active]}</p>}
      {removed&&<div className="profile-undo" role="status"><span>목록에서 뺐어요. 저장하기 전에는 되돌릴 수 있어요.</span><button type="button" className="text-button" onClick={undo}><Undo2 size={15}/> 되돌리기</button></div>}
      {!profile[active].length?<div className="profile-empty"><Icon size={30}/><strong>아직 등록한 {section.label}이 없어요</strong><p>새 항목을 추가하면 세부 내용을 적을 수 있어요.</p><button type="button" className="button" onClick={add}><Plus size={16}/>첫 {section.singular} 등록</button></div>:profile[active].map((record,index)=><details className="profile-record" key={record.id} open>
        <summary><span className="profile-record-number">{String(index+1).padStart(2,'0')}</span><strong>{record.schoolName||record.name||`새 ${section.singular}`}</strong><span className="profile-record-caption">펼치기 / 접기</span></summary>
        <div className="profile-record-body">
          {section.groups?section.groups.filter(group=>record.schoolType==='고등학교'?['school','highschool','notes'].includes(group.key):group.key!=='highschool').map(group=><fieldset className="profile-field-group" key={group.key}>
            <legend>{group.label}</legend>
            {group.description&&<p className="profile-group-description">{group.description}</p>}
            <div className="profile-fields">{group.fields.filter(key=>record.schoolType!=='고등학교'||!['degree','admissionType','departmentCategory'].includes(key)).map(key=>renderField(record,section.fields.find(f=>f.key===key)))}</div>
          </fieldset>):<div className="profile-fields">{section.fields.map(f=>renderField(record,f))}</div>}
          <div className="profile-record-footer"><button type="button" className="text-button" disabled={busy} onClick={()=>remove(record,index)}><X size={14}/>이 {section.singular} 목록에서 빼기</button></div>
        </div>
      </details>)}
      {active==='projects'&&<p className="profile-note">여기는 지원서용 프로젝트 이력을 보관하는 곳이에요. 자소서에서 선택할 경험은 ‘내 경험 보관함’에서 따로 정리해 주세요.</p>}
    </section>
    <details className="profile-source card"><summary>정리해 둔 원문·추가 메모</summary><Field label="내가 정리해 둔 소개 자료"><textarea rows={4} value={profile.source} onChange={e=>change({...profile,source:e.target.value})}/></Field></details>
    <div className="profile-save"><div><label className="check-label"><input type="checkbox" checked={profile.confirmed} onChange={e=>onChange({...profile,confirmed:e.target.checked})}/>입력한 내용이 정확한지 확인했어요.</label><span className="profile-save-state" role="status">{dirty?'저장 전 변경사항이 있어요. 다른 분류로 이동해도 입력은 유지돼요.':'저장된 기본 정보예요. 이 컴퓨터에만 보관합니다.'}</span></div><button type="submit" className="button primary" disabled={busy||!dirty}>{busy?<Save size={16}/>:dirty?<Save size={16}/>:<Check size={16}/>} {busy?'저장 중…':'기본 정보 저장'}</button></div>
  </form>;
}
