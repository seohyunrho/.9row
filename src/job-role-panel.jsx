import React,{useEffect,useId,useRef,useState} from 'react';
import {useOffice} from './ui.jsx';
import {buildRoleDescription} from '../lib/job-role-description.mjs';
import './job-role-panel.css';

const sourceKeys=['body','requirements','role','url'];
const sections=[['duties','주요 업무'],['qualifications','직무별 지원 자격'],['preferred','직무별 우대사항']];
const snapshotOf=job=>Object.fromEntries(sourceKeys.map(key=>[key,typeof job?.[key]==='string'?job[key]:'']));
const sameSource=(left,right)=>!!left&&!!right&&sourceKeys.every(key=>(left[key]||'')===(right[key]||''));
const hasLayout=value=>Array.isArray(value)&&value.length>0&&value.every(page=>Array.isArray(page?.lines)&&page.lines.length>0);
const imagePosting=job=>String(job.bodyFormat||'').startsWith('image')||(job.bodyFormat!=='text'&&Array.isArray(job.sourceImages)&&job.sourceImages.length>0);

export function JobRolePanel({job,onBusyChange,disabled=false}){
  const {commit,busy,workspace}=useOffice();
  const [desiredRole,setDesiredRole]=useState(job.desiredRole||'');
  const [working,setWorking]=useState(false);
  const [status,setStatus]=useState('');
  const [error,setError]=useState('');
  const id=useId();
  const jobRef=useRef(job),commitRef=useRef(commit),workspaceRef=useRef(workspace),busyCallbackRef=useRef(onBusyChange);
  const requestRef=useRef(null);
  jobRef.current=job;commitRef.current=commit;workspaceRef.current=workspace;busyCallbackRef.current=onBusyChange;
  useEffect(()=>()=>{
    requestRef.current?.controller.abort();
    requestRef.current=null;
    busyCallbackRef.current?.(false);
  },[]);

  const result=job.roleDescription&&typeof job.roleDescription==='object'?job.roleDescription:null;
  const savedRole=result?.desiredRole||job.desiredRole||'관심 직무';
  const inputChanged=!!result&&desiredRole.trim()!==savedRole;
  const sourceChanged=!!result&&!sameSource(result.sourceSnapshot,snapshotOf(job));
  const notes=Array.isArray(result?.notes)?result.notes.filter(note=>typeof note==='string'&&note.trim()):[];

  const organize=async event=>{
    event.preventDefault();
    if(disabled||working||busy||requestRef.current)return;
    const role=desiredRole.trim();
    if(!role){setError('정리할 관심 직무를 입력해 주세요.');setStatus('');return;}
    const original=jobRef.current;
    const snapshot=snapshotOf(original);
    const request={controller:new AbortController(),jobId:original.id,workspace:workspaceRef.current};
    const isCurrent=()=>requestRef.current===request&&!request.controller.signal.aborted&&jobRef.current.id===request.jobId&&workspaceRef.current===request.workspace;
    requestRef.current=request;
    setError('');setWorking(true);setStatus('공고에서 직무에 해당하는 내용을 정리하고 있어요.');
    busyCallbackRef.current?.(true);
    try{
      let enriched=original;
      let freshLayout;
      if(imagePosting(original)&&(!hasLayout(original.textLayout)||!original.body?.trim())){
        if(!original.url)throw Error('이미지의 글자 위치를 읽을 공고 링크가 없어요. 공고 링크를 확인한 뒤 다시 시도해 주세요.');
        setStatus('이미지에서 직무별 내용을 구분하고 있어요. 잠시 기다려 주세요.');
        const response=await fetch('/api/jobs/import',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:original.url}),signal:request.controller.signal});
        if(!isCurrent())return;
        if(response.status===404)throw Error('현재 앱에 직무 정리 기능이 아직 적용되지 않았어요. 앱의 실행 프로그램을 다시 시작해 주세요.');
        let payload;
        try{payload=await response.json();}catch{throw Error('이미지 읽기 결과를 받지 못했어요. 잠시 뒤 다시 시도해 주세요.');}
        if(!isCurrent())return;
        if(!response.ok)throw Error(payload.error||'이미지에서 직무별 내용을 읽지 못했어요. 잠시 뒤 다시 시도해 주세요.');
        if(!hasLayout(payload.job?.textLayout))throw Error('이미지에서 직무별 내용을 구분하지 못했어요. 원문 이미지를 확인한 뒤 다시 시도해 주세요.');
        freshLayout=payload.job.textLayout;
        enriched={...original,textLayout:freshLayout,...(!original.body?.trim()?{body:payload.job.body,requirements:payload.job.requirements,textExtraction:payload.job.textExtraction}:{})};
      }
      if(!isCurrent())return;
      if(!sameSource(snapshot,snapshotOf(jobRef.current)))throw Error('정리하는 동안 공고 내용이 바뀌었어요. 최신 공고로 다시 정리해 주세요.');
      const description={...await buildRoleDescription(enriched,role),sourceSnapshot:snapshot};
      if(!isCurrent())return;
      setStatus('관심 직무와 정리한 내용을 함께 저장하고 있어요.');
      let saveError='';
      const saved=await commitRef.current(state=>{
        if(!isCurrent())throw Error('화면이 바뀌어 직무 정리를 중단했어요.');
        const target=state.jobs.find(item=>item.id===request.jobId);
        if(!target){saveError='공고를 찾지 못했어요. 공고 목록에서 다시 열어 주세요.';throw Error(saveError);}
        if(!sameSource(snapshot,snapshotOf(target))){saveError='정리하는 동안 공고 내용이 바뀌었어요. 최신 공고로 다시 정리해 주세요.';throw Error(saveError);}
        target.desiredRole=role;
        target.roleDescription=description;
        if(freshLayout)target.textLayout=freshLayout;
      },'관심 직무와 JD를 공고에 저장했어요.');
      if(!isCurrent())return;
      if(!saved)throw Error(saveError||'JD를 저장하지 못했어요. 기존에 저장한 내용은 유지됩니다. 화면 위의 저장 오류를 확인한 뒤 다시 시도해 주세요.');
      setDesiredRole(role);
      setStatus(`${role} JD를 공고에 저장했어요.`);
    }catch(cause){
      if(isCurrent()){setError(cause.message||'직무를 정리하지 못했어요. 다시 시도해 주세요.');setStatus('');}
    }finally{
      if(requestRef.current===request){requestRef.current=null;setWorking(false);busyCallbackRef.current?.(false);}
    }
  };

  return <section className="cj-content-section cj-role-panel" aria-labelledby={`${id}-heading`}>
    <div className="cj-section-heading"><h2 id={`${id}-heading`}>관심 직무 JD</h2><span className="cj-caption">현재 공고 기준</span></div>
    <p id={`${id}-hint`} className="cj-role-hint">JD는 직무 설명입니다. 이 공고에서 선택한 직무의 업무·자격·우대사항을 정리해요.</p>
    <form onSubmit={organize} aria-busy={working}>
      <label htmlFor={`${id}-input`} className="cj-role-label">관심 직무</label>
      <div className="cj-role-input-row">
        <input id={`${id}-input`} type="text" value={desiredRole} onChange={event=>{setDesiredRole(event.target.value);setError('');setStatus('');}} placeholder="예: 경영전략" maxLength={120} required disabled={disabled||working||busy} autoComplete="off" aria-describedby={`${id}-hint ${id}-save-hint`} />
        <button className="cj-button cj-primary" type="submit" disabled={disabled||working||busy||!desiredRole.trim()}>{working?'JD 정리 중…':'이 직무로 JD 정리'}</button>
      </div>
      <p id={`${id}-save-hint`} className="cj-role-save-hint">정리하면 관심 직무와 결과가 이 공고에 함께 저장됩니다.</p>
    </form>
    <p className="cj-role-status" role="status" aria-live="polite" aria-atomic="true">{status}</p>
    {error&&<p className="cj-role-error" role="alert">{error}</p>}
    {result&&<div className="cj-role-result" aria-labelledby={`${id}-result-heading`}>
      <div className="cj-role-result-heading"><h3 id={`${id}-result-heading`}>{savedRole} JD</h3><span>저장된 정리</span></div>
      {inputChanged&&<p className="cj-role-change-note">입력한 직무가 바뀌었어요. 아래는 저장된 ‘{savedRole}’ 결과입니다. 새 직무로 보려면 다시 정리해 주세요.</p>}
      {sourceChanged&&<p className="cj-role-change-note">정리한 뒤 공고 원문이 바뀌었어요. 아래 결과는 이전 내용을 기준으로 하므로 다시 정리해 주세요.</p>}
      {result.matched===false&&<p className="cj-role-change-note">공고에서 ‘{savedRole}’에 해당하는 항목을 찾지 못했어요. 직무명과 원문을 확인해 주세요.</p>}
      <p className="cj-role-source-note">선택한 직무에 명시된 내용입니다.{imagePosting(job)&&' 이미지에서 읽은 글자는 오인식이 있을 수 있으니 위 원문과 함께 확인해 주세요.'}</p>
      <div className="cj-role-groups">{sections.map(([key,title])=>{
        const entries=Array.isArray(result[key])?result[key].filter(item=>item?.scope==='role'&&typeof item.text==='string'&&item.text.trim()):[];
        return <section className="cj-role-group" key={key} aria-labelledby={`${id}-${key}`}><h4 id={`${id}-${key}`}>{title}</h4>{entries.length?<ul>{entries.map((item,index)=><li key={`${key}-${index}`}><div className="cj-role-entry"><p>{item.text}</p></div></li>)}</ul>:<p className="cj-role-empty">이 직무에 별도로 명시된 내용을 확인하지 못했어요.</p>}</section>;
      })}</div>
      {notes.length>0&&<ul className="cj-role-notes" aria-label="정리할 때 확인한 내용">{notes.map((note,index)=><li key={index}>{note}</li>)}</ul>}
    </div>}
  </section>;
}
