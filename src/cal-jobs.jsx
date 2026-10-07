import React,{useEffect,useRef,useState} from 'react';
import {Plus,Search,ArrowLeft,ArrowUpRight,ChevronRight,Pencil,FileText,BriefcaseBusiness,X,Link,Trash2} from 'lucide-react';
import {useOffice,uid,now,dayLeft,dueLabel,formatDate,safeUrl,Modal,Field} from './ui.jsx';
import {JobModal} from './records.jsx';
import {JobRolePanel} from './job-role-panel.jsx';
import {jobSourcePreview} from './job-source-preview.js';

function Deadline({job}){
  const left=dayLeft(job.deadline);
  return <span className={`cj-deadline ${left!==null&&left>=0&&left<=3?'is-urgent':''} ${left!==null&&left<0?'is-closed':''}`}>{dueLabel(job.deadline)}</span>;
}

function sourceImages(job){
  return (Array.isArray(job?.sourceImages)?job.sourceImages:[]).filter(value=>{
    try{const image=new URL(value);const source=new URL(job.url);return image.protocol==='https:'&&!image.username&&!image.password&&image.origin===source.origin;}catch{return false;}
  });
}

export function CalJobsPage(){
  const {data,selectedJob,setSelectedJob,commit,busy,navigate,workspace,notify}=useOffice();
  const [editing,setEditing]=useState(null),[query,setQuery]=useState(''),[filter,setFilter]=useState('all'),[sort,setSort]=useState('deadline');
  const [importOpen,setImportOpen]=useState(false),[importUrl,setImportUrl]=useState(''),[importing,setImporting]=useState(false),[importError,setImportError]=useState('');
  const [jdBusy,setJdBusy]=useState(false);
  const [deletion,setDeletion]=useState(null),[deleting,setDeleting]=useState(false),[deleteError,setDeleteError]=useState(''),[approvedLinked,setApprovedLinked]=useState('');
  const importRequest=useRef(null);
  const deleteRequest=useRef(null);
  useEffect(()=>()=>{importRequest.current?.abort();deleteRequest.current=null;},[]);
  const job=data.jobs.find(item=>item.id===selectedJob);
  const preview=jobSourcePreview(job);
  const images=preview?[]:sourceImages(job);
  const blank=()=>({id:uid(),company:'',role:'',type:'신입',deadline:'',url:'',body:'',requirements:'',stage:'saved',color:'green',createdAt:now()});
  const near=item=>{const n=dayLeft(item.deadline);return n!==null&&n>=0&&n<=7;};
  const closed=item=>{const n=dayLeft(item.deadline);return n!==null&&n<0;};
  const filtered=data.jobs.filter(item=>(filter==='all'||(filter==='soon'?near(item):closed(item)))&&`${item.company} ${item.role}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  filtered.sort((a,b)=>sort==='latest'?String(b.createdAt||'').localeCompare(String(a.createdAt||'')):Number(closed(a))-Number(closed(b))||(a.deadline||'9999').localeCompare(b.deadline||'9999')||a.company.localeCompare(b.company));
  const essayCounts=id=>{const essays=data.essays.filter(e=>e.jobId===id);return {total:essays.length,written:essays.filter(e=>e.draft?.trim()).length};};
  const counts=job?essayCounts(job.id):null;
  const linkedEssays=deletion?data.essays.filter(essay=>essay.jobId===deletion.job.id):[];
  const linkedKey=JSON.stringify(linkedEssays.map(essay=>essay.id).sort());
  const canDeleteLinked=!linkedEssays.length||approvedLinked===linkedKey;
  const closeDelete=()=>{if(!deleteRequest.current){setDeletion(null);setDeleteError('');setApprovedLinked('');}};
  const openDelete=()=>{if(!job||busy||importing||jdBusy)return;setDeletion({job:structuredClone(job),workspace});setDeleteError('');setApprovedLinked('');};
  const deleteJob=async event=>{
    event.preventDefault();
    if(!deletion||deleteRequest.current||busy||importing||jdBusy||!canDeleteLinked)return;
    if(deletion.workspace!==workspace){closeDelete();return;}
    const request={};deleteRequest.current=request;setDeleting(true);setDeleteError('');
    let failure='';
    try{
      const saved=await commit(state=>{
        const target=state.jobs.find(item=>item.id===deletion.job.id);
        const currentLinks=state.essays.filter(essay=>essay.jobId===deletion.job.id).map(essay=>essay.id).sort();
        if(!target||JSON.stringify(target)!==JSON.stringify(deletion.job)||JSON.stringify(currentLinks)!==linkedKey){
          failure='공고나 연결된 자기소개서가 바뀌었어요. 취소 후 다시 삭제 버튼을 눌러 주세요.';
          throw Error(failure);
        }
        state.jobs=state.jobs.filter(item=>item.id!==target.id);
        state.essays=state.essays.filter(essay=>essay.jobId!==target.id);
      },linkedEssays.length?'공고와 연결된 자기소개서를 삭제했어요.':'공고를 삭제했어요.');
      if(deleteRequest.current!==request)return;
      if(saved){setDeletion(null);setApprovedLinked('');setSelectedJob(null);}
      else setDeleteError(failure||'삭제 내용을 저장하지 못했어요. 취소 후 새로고침하고 다시 시도해 주세요.');
    }finally{
      if(deleteRequest.current===request){deleteRequest.current=null;setDeleting(false);}
    }
  };
  const save=async form=>{const ok=await commit(s=>{const i=s.jobs.findIndex(j=>j.id===form.id);if(i<0)s.jobs.unshift(form);else for(const key of ['company','role','type','deadline','url','body','requirements'])s.jobs[i][key]=form[key];},'공고를 보관했어요');if(ok){setSelectedJob(form.id);setEditing(null);}};
  const importLink=async (url,refresh=false)=>{
    if(importing||busy||jdBusy||importRequest.current)return;
    const controller=new AbortController();importRequest.current=controller;
    setImporting(true);setImportError('');
    try{
      const response=await fetch('/api/jobs/import',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:url.trim()}),signal:controller.signal});
      if(response.status===404)throw Error('현재 열어 둔 앱에 링크 등록 기능이 아직 적용되지 않았어요. 이 앱의 실행 프로그램을 다시 시작해 주세요.');
      const result=await response.json();if(!response.ok)throw Error(result.error||'공고 링크를 가져오지 못했어요.');
      if(controller.signal.aborted)return;
      const imported=result.job;const existing=data.jobs.find(item=>item.url===imported.url);
      if(existing){
        const fillBody=(refresh||!existing.body?.trim())&&!!imported.body?.trim();
        const fillRequirements=refresh||(!existing.requirements?.trim()&&!!imported.requirements?.trim());
        if(fillBody||fillRequirements){
          const saved=await commit(state=>{
            const target=state.jobs.find(item=>item.id===existing.id);
            if(!target)throw Error('공고 목록이 바뀌었어요. 새로고침한 뒤 다시 시도해 주세요.');
            if(controller.signal.aborted)throw Error('화면이 바뀌어 가져오기를 중단했어요.');
            if(refresh&&['body','requirements','url'].some(key=>target[key]!==existing[key]))throw Error('읽는 동안 공고 내용이 바뀌었어요. 최신 내용을 확인한 뒤 다시 시도해 주세요.');
            if(fillBody){target.body=imported.body;target.bodyFormat=imported.bodyFormat;target.sourceImages=imported.sourceImages;target.textExtraction=imported.textExtraction;target.textLayout=imported.textLayout;}
            if(fillRequirements){target.requirements=imported.requirements;target.requirementsExtraction=imported.requirementsExtraction;}
            target.importedAt=imported.importedAt;
          },refresh?'이미지에서 본문과 조건을 다시 읽었어요. 관심 직무 JD도 다시 정리해 주세요.':'기존 공고에 비어 있던 본문과 조건을 채웠어요.');
          if(controller.signal.aborted)return;
          if(!saved)throw Error('공고 글자를 읽었지만 저장하지 못했어요. 화면 위의 저장 오류를 확인해 주세요.');
        }else notify('이미 보관한 공고예요. 기존 자료를 열었습니다.');
        setSelectedJob(existing.id);setImportOpen(false);setImportUrl('');return;
      }
      const saved=await commit(state=>{state.jobs.unshift(imported);},'공고를 가져와 보관했어요.');
      if(controller.signal.aborted)return;
      if(saved){setSelectedJob(imported.id);setImportOpen(false);setImportUrl('');}
      else throw Error('공고를 읽었지만 저장하지 못했어요. 화면 위의 저장 오류를 확인해 주세요.');
    }catch(error){if(!controller.signal.aborted)setImportError(error.message||'공고 링크를 가져오지 못했어요.');}
    finally{if(importRequest.current===controller)importRequest.current=null;if(!controller.signal.aborted)setImporting(false);}
  };
  const importFromLink=event=>{event.preventDefault();return importLink(importUrl);};
  return <div className="cj-page">
    {job?<>
      <button className="cj-back" onClick={()=>setSelectedJob(null)}><ArrowLeft size={15} aria-hidden="true"/>관심 공고 목록</button>
      <header className="cj-detail-heading"><div><div className="cj-company-line"><span>{job.company}</span>{workspace==='demo'&&<span className="cj-sample">샘플 공고</span>}</div><h1>{job.role}</h1><div className="cj-detail-meta"><span>{job.type}</span><span aria-hidden="true">·</span><span>{job.deadline?`${formatDate(job.deadline)} 마감`:'마감일 미정'}</span><Deadline job={job}/></div></div><div className="cj-detail-actions"><button className="cj-button" disabled={jdBusy||importing||busy||deleting} onClick={()=>setEditing(structuredClone(job))}><Pencil size={14} aria-hidden="true"/>공고 수정</button><button type="button" className="cj-button cj-danger" disabled={jdBusy||importing||busy||deleting} onClick={openDelete}><Trash2 size={14} aria-hidden="true"/>공고 삭제</button></div></header>
      <div className="cj-detail-layout"><div className="cj-reading">
        <section className="cj-content-section">
          <div className="cj-section-heading"><h2>공고 원문</h2>{safeUrl(job.url)&&<a href={safeUrl(job.url)} target="_blank" rel="noreferrer" className="cj-link">원문 사이트<ArrowUpRight size={14} aria-hidden="true"/></a>}</div>
          {preview&&<div className="cj-source-images"><figure><a href={preview.src} target="_blank" rel="noreferrer" className="cj-link">원문 이미지 크게 보기<ArrowUpRight size={14} aria-hidden="true"/></a><img src={preview.src} width={preview.width} height={preview.height} alt={`${job.company} ${job.role} 공고 전체 원문 — 모집 표와 지원 안내`} loading="lazy"/><figcaption className="cj-caption">{preview.capturedOn} 원문 화면</figcaption></figure></div>}
          {images.length>0&&<div className="cj-source-images">
            {images.map((url,index)=><figure key={url}><a href={url} target="_blank" rel="noreferrer" className="cj-link">원문 이미지 크게 보기<ArrowUpRight size={14} aria-hidden="true"/></a><img src={url} alt={`${job.company} ${job.role} 공고 원문 ${index+1}`} loading="lazy" referrerPolicy="no-referrer"/></figure>)}
          </div>}
          {!preview&&job.body&&(!images.length||job.bodyFormat==='text')&&<div className="cj-body">{job.body}</div>}
          {!importOpen&&importError&&<div className="error-banner" role="alert">{importError}</div>}
          {!job.body&&!images.length&&<p className="cj-body">공고 본문이 아직 없습니다. 공고 수정을 눌러 내용을 붙여넣어 주세요.</p>}
        </section>
        <JobRolePanel key={`${workspace}:${job.id}`} job={job} disabled={importing||!!editing||!!deletion} onBusyChange={setJdBusy}/>
      </div><aside className="cj-preparation" aria-labelledby="cj-prepare-title"><span className="cj-note-icon"><FileText size={20} aria-hidden="true"/></span><h2 id="cj-prepare-title">자기소개서 준비</h2><p>{counts.total?'등록한 문항을 이어서 작성하세요.':'공고에 맞는 문항을 등록하고 초안을 시작해 보세요.'}</p><dl><div><dt>등록된 문항</dt><dd>{counts.total}개</dd></div><div><dt>본문 저장</dt><dd>{counts.written}개</dd></div></dl><button className="cj-button cj-primary" onClick={()=>navigate('essays',job.id)}><Pencil size={15} aria-hidden="true"/>초안 작성하기</button></aside></div>
    </>:<>
      <header className="cj-heading"><div><h1>관심 공고</h1><p>공고 링크를 넣으면 내용을 가져와 바로 보관해요.</p></div><div className="cj-heading-actions"><button className="cj-button cj-primary" onClick={()=>{setImportError('');setImportOpen(true);}}><Link size={15} aria-hidden="true"/>링크로 등록</button><button className="cj-button" onClick={()=>setEditing(blank())}><Plus size={16} aria-hidden="true"/>직접 등록</button></div></header>
      <div className="cj-toolbar"><div className="cj-filters" role="group" aria-label="공고 필터">{[['all','전체',data.jobs.length],['soon','7일 이내',data.jobs.filter(near).length],['closed','마감',data.jobs.filter(closed).length]].map(([id,label,count])=><button key={id} aria-pressed={filter===id} onClick={()=>setFilter(id)}>{label}<span>{count}</span></button>)}</div><div className="cj-tools"><div className="cj-search"><Search size={16} aria-hidden="true"/><input aria-label="공고 검색" placeholder="회사나 직무 검색" value={query} onChange={e=>setQuery(e.target.value)}/>{query&&<button aria-label="검색어 지우기" onClick={()=>setQuery('')}><X size={14}/></button>}</div><select aria-label="공고 정렬" value={sort} onChange={e=>setSort(e.target.value)}><option value="deadline">마감일순</option><option value="latest">최근 등록순</option></select></div></div>
      <div className="cj-list-summary"><span>{query||filter!=='all'?'검색 결과':'보관한 공고'} <strong>{filtered.length}개</strong></span>{workspace==='demo'&&<span>샘플 공간</span>}</div>
      {filtered.length?<div className="cj-table"><div className="cj-table-head" aria-hidden="true"><span>회사 · 직무</span><span>채용 구분</span><span>마감일</span><span>자소서</span><span/></div><ul aria-label="관심 공고 목록">{filtered.map(item=>{const count=essayCounts(item.id);return <li key={item.id}><button className="cj-job-row" onClick={()=>setSelectedJob(item.id)}><span className="cj-job-main"><span className="cj-company-initial" aria-hidden="true">{item.company.slice(0,1)}</span><span><strong>{item.company}</strong><span>{item.role}</span></span></span><span className="cj-job-type">{item.type}</span><span className="cj-job-date"><span>{item.deadline?formatDate(item.deadline):'미정'}</span><Deadline job={item}/></span><span className="cj-job-progress">{count.total?`${count.written} / ${count.total}문항`:'작성 전'}</span><ChevronRight size={16} className="cj-row-arrow" aria-hidden="true"/></button></li>;})}</ul></div>:<div className="cj-empty"><BriefcaseBusiness size={27} aria-hidden="true"/><h2>{data.jobs.length?'조건에 맞는 공고가 없습니다.':'첫 관심 공고를 저장해 보세요.'}</h2><p>{data.jobs.length?'검색어나 필터를 바꾸면 다른 공고를 볼 수 있어요.':'공고 링크를 등록하면 내용을 읽어 자동으로 보관합니다.'}</p>{data.jobs.length?<button className="cj-button" onClick={()=>{setQuery('');setFilter('all');}}>검색 · 필터 초기화</button>:<div className="cj-empty-actions"><button className="cj-button cj-primary" onClick={()=>{setImportError('');setImportOpen(true);}}><Link size={15} aria-hidden="true"/>링크로 등록</button><button className="cj-button" onClick={()=>setEditing(blank())}><Plus size={15} aria-hidden="true"/>직접 등록</button></div>}</div>}
    </>}
    {importOpen&&<Modal title="링크로 공고 등록" onClose={()=>{if(!importing)setImportOpen(false);}}><form onSubmit={importFromLink}><Field label="공고 링크" hint="공개된 공고와 원문 이미지의 글자를 읽어 바로 보관합니다. 긴 이미지는 시간이 조금 더 걸릴 수 있어요. 읽기에 실패하면 저장하지 않고 안내합니다."><input type="url" required maxLength={2048} value={importUrl} onChange={event=>setImportUrl(event.target.value)} placeholder="https://채용사이트/공고주소" disabled={importing} autoFocus/></Field>{importError&&<div className="error-banner" role="alert"><span>{importError}</span></div>}<div className="form-footer"><button className="button" type="button" disabled={importing} onClick={()=>setImportOpen(false)}>취소</button><button className="button primary" type="submit" disabled={importing||busy}>{importing?'공고와 이미지 글자 읽는 중…':'가져와서 바로 보관'}</button></div></form></Modal>}
    {editing&&<JobModal job={editing} busy={busy} onClose={()=>setEditing(null)} onSave={save}/>}
    {deletion&&<Modal title="공고를 삭제할까요?" onClose={closeDelete}><form onSubmit={deleteJob} aria-busy={deleting}>
      <div className="cj-delete-target"><strong>{deletion.job.company}</strong><p>{deletion.job.role}</p></div>
      <p className="cj-delete-description">이 공고와 저장된 JD가 삭제됩니다. 삭제 후에는 되돌릴 수 없어요.</p>
      {linkedEssays.length>0&&<div className="cj-delete-linked"><p>연결된 자기소개서 <strong>{linkedEssays.length}개</strong>가 있습니다. 공고를 삭제하려면 해당 자기소개서의 본문·이전 버전·피드백도 함께 삭제해야 합니다.</p><label><input type="checkbox" checked={approvedLinked===linkedKey} onChange={event=>setApprovedLinked(event.target.checked?linkedKey:'')} disabled={deleting||busy}/>연결된 자기소개서 {linkedEssays.length}개도 함께 삭제하겠습니다.</label></div>}
      <p className="cj-caption">지원 현황에 남긴 기록은 유지됩니다.</p>
      {deleteError&&<p className="error-banner" role="alert">{deleteError}</p>}
      <div className="form-footer"><button type="button" className="button" onClick={closeDelete} disabled={deleting||busy} autoFocus>취소</button><button type="submit" className="button cj-delete-confirm" disabled={deleting||busy||!canDeleteLinked}>{deleting?'삭제 중…':linkedEssays.length?'공고와 자기소개서 삭제':'공고 삭제'}</button></div>
    </form></Modal>}
  </div>;
}
