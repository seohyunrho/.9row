import React,{useEffect,useRef,useState} from 'react';
import {Plus,Search,FilePenLine,ArrowLeft,Trash2} from 'lucide-react';
import {useOffice,PageHeading,Empty,Field,Modal,uid,now} from './ui.jsx';
import {useGuard} from './helpers.jsx';
import './essay-questions.css';

export function EssayLibrary({review=false,onSelect}) {
  const {data,navigate,selectedJob}=useOffice();
  const [query,setQuery]=useState('');const [creating,setCreating]=useState(false);
  const all=data.essays.filter(e=>!review||e.draft.trim());
  const list=[...all].filter(e=>{const job=data.jobs.find(j=>j.id===e.jobId);return `${job?.company} ${job?.role} ${e.question}`.toLowerCase().includes(query.toLowerCase());}).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
  return <><PageHeading eyebrow="자기소개서" title={review?'검토받기':'자소서 쓰기'} description={review?'저장한 글을 골라 피드백을 받고, 다시 다듬어 보세요.':'지금 쓰는 글과 이전에 쓴 글을 한곳에서 이어갑니다. 초안도 여기서 시작하세요.'} action={!review&&<button className="button primary" disabled={!data.jobs.length} onClick={()=>setCreating(true)}><Plus size={16}/> 문항 추가하기</button>}/><div className="list-tools"><span className="record-count">{review?'검토할 수 있는 글':'보관한 문항'} {all.length}개</span><div className="search-box"><Search size={16}/><input aria-label="자소서 검색" placeholder="회사 · 직무 · 문항 검색" value={query} onChange={e=>setQuery(e.target.value)}/></div></div><div className="essay-library">{list.map(essay=>{const job=data.jobs.find(j=>j.id===essay.jobId);return <button className="essay-library-item" key={essay.id} onClick={()=>onSelect(essay.id)}><span className="essay-library-top"><span>{job?.company} · {job?.role}</span><span className="pill">{essay.draft.trim()?'작성 중':'작성 준비'}</span></span><strong>{essay.question}</strong><p>{essay.draft.trim()?essay.draft.slice(0,130):'경험을 선택해 초안을 만들거나 직접 작성하세요.'}</p><small>{new Date(essay.updatedAt).toLocaleDateString('ko-KR')} · 저장 버전 {essay.versions.length}개{essay.reviews?.length?` · 피드백 ${essay.reviews.length}개`:''}<span>{review?'이 글 검토하기 →':'이어서 쓰기 →'}</span></small></button>;})}</div>{!list.length&&<Empty icon={FilePenLine} title={query?'검색한 글이 없어요':review?'검토할 본문이 아직 없어요':'첫 자소서를 시작해 볼까요?'} action={query?<button className="button" onClick={()=>setQuery('')}>검색 초기화</button>:<button className="button primary" onClick={()=>review?navigate('essays'):data.jobs.length?setCreating(true):navigate('jobs')}>{review?'자소서 쓰러 가기':data.jobs.length?'문항 추가하기':'공고 등록하기'}</button>}>{review?'자소서 쓰기에서 본문을 작성하고 저장하면 이곳에 나타납니다.':'공고를 선택하고 문항을 등록하면 초안 작성과 편집을 시작할 수 있어요.'}</Empty>}{creating&&<NewEssayModal jobId={selectedJob} onClose={()=>setCreating(false)} onCreated={id=>{setCreating(false);onSelect(id);}}/>}</>;
}
export function NewEssayModal({jobId,onClose,onCreated}) {
  const {data,commit,busy,setDirty}=useOffice();
  const newQuestion=()=>({id:uid(),question:'',limit:'800',includeSpaces:true});
  const [form,setForm]=useState(()=>({jobId:data.jobs.some(j=>j.id===jobId)?jobId:data.jobs[0]?.id||'',questions:[newQuestion()]}));
  const [submitting,setSubmitting]=useState(false),[error,setError]=useState('');
  const submittingRef=useRef(false),questionInputs=useRef(new Map()),nextFocus=useRef(null);
  const [initial]=useState(form);const dirty=JSON.stringify(form)!==JSON.stringify(initial);useGuard(dirty);
  const locked=busy||submitting;
  const existingCount=data.essays.filter(essay=>essay.jobId===form.jobId).length;
  useEffect(()=>{if(nextFocus.current){questionInputs.current.get(nextFocus.current)?.focus();nextFocus.current=null;}},[form.questions.length]);
  const close=()=>{if(locked||submittingRef.current)return;if(!dirty||confirm('저장하지 않은 문항이 있어요. 닫을까요?'))onClose();};
  const updateQuestion=(id,key,value)=>{setError('');setForm(current=>({...current,questions:current.questions.map(question=>question.id===id?{...question,[key]:value}:question)}));};
  const addQuestion=()=>{if(locked)return;const question=newQuestion();nextFocus.current=question.id;setForm(current=>({...current,questions:[...current.questions,question]}));setError('');};
  const removeQuestion=id=>{
    if(locked||form.questions.length===1)return;
    const index=form.questions.findIndex(question=>question.id===id);
    if(form.questions[index].question.trim()&&!confirm('아직 저장하지 않은 이 문항 입력을 지울까요?'))return;
    nextFocus.current=form.questions[index+1]?.id||form.questions[index-1]?.id;
    setForm(current=>({...current,questions:current.questions.filter(question=>question.id!==id)}));setError('');
  };
  const submit=async event=>{
    event.preventDefault();if(locked||submittingRef.current)return;
    const invalid=form.questions.find(question=>!question.question.trim()||!Number.isInteger(Number(question.limit))||Number(question.limit)<1||Number(question.limit)>50000);
    if(invalid){setError('각 문항의 내용과 1~50,000자 사이의 글자 수 제한을 입력해 주세요.');questionInputs.current.get(invalid.id)?.focus();return;}
    submittingRef.current=true;setSubmitting(true);setError('');
    const entries=form.questions.map(question=>({...question,question:question.question.trim(),limit:Number(question.limit),jobId:form.jobId,experienceIds:[],outline:'',draft:'',versions:[],updatedAt:now()}));
    try{
      const ok=await commit(state=>{
        const job=state.jobs.find(item=>item.id===form.jobId);
        if(!job)throw Error('선택한 공고를 찾지 못했어요. 공고를 다시 선택해 주세요.');
        if(state.essays.some(essay=>entries.some(entry=>entry.id===essay.id)))throw Error('이미 저장된 문항이에요. 목록을 다시 확인해 주세요.');
        state.essays.push(...entries);job.stage='writing';
      },`${entries.length}개 문항을 각각 저장했어요.`);
      if(ok){setDirty(false);onCreated(entries[0].id,form.jobId);}
      else setError('문항을 저장하지 못했어요. 입력한 내용은 유지됩니다. 다시 시도해 주세요.');
    }finally{submittingRef.current=false;setSubmitting(false);}
  };
  return <Modal title="자기소개서 문항 추가" onClose={close}><form className="essay-questions-form" onSubmit={submit} aria-busy={submitting}>
    <Field label="지원할 공고"><select required value={form.jobId} disabled={locked} onChange={event=>setForm(current=>({...current,jobId:event.target.value}))}>{data.jobs.map(job=><option key={job.id} value={job.id}>{job.company} · {job.role}</option>)}</select></Field>
    <p className="essay-questions-hint">문항을 하나씩 추가하고, 각 답변의 글자 수 제한을 설정해 주세요.{existingCount>0&&` 이미 저장된 ${existingCount}개 문항 뒤에 추가됩니다.`}</p>
    <div className="essay-question-fields">{form.questions.map((question,index)=>{
      const number=existingCount+index+1;
      return <section key={question.id} className="essay-question-card" aria-labelledby={`question-title-${question.id}`}>
        <div className="essay-question-card-heading"><h3 id={`question-title-${question.id}`}>문항 {number}</h3>{form.questions.length>1&&<button className="text-button" type="button" aria-label={`문항 ${number} 입력 삭제`} disabled={locked} onClick={()=>removeQuestion(question.id)}><Trash2 size={14} aria-hidden="true"/>삭제</button>}</div>
        <Field label={`문항 ${number} 내용`}><textarea ref={node=>{if(node)questionInputs.current.set(question.id,node);else questionInputs.current.delete(question.id);}} required rows={3} disabled={locked} value={question.question} onChange={event=>updateQuestion(question.id,'question',event.target.value)} placeholder="예: 지원 동기와 입사 후 이루고 싶은 목표를 작성해 주세요."/></Field>
        <div className="form-row"><Field label={`문항 ${number} 글자 수 제한`}><input required type="number" min={1} max={50000} step={1} disabled={locked} value={question.limit} onChange={event=>updateQuestion(question.id,'limit',event.target.value)}/></Field><Field label={`문항 ${number} 글자 수 기준`}><select disabled={locked} value={question.includeSpaces?'include':'exclude'} onChange={event=>updateQuestion(question.id,'includeSpaces',event.target.value==='include')}><option value="include">공백 포함</option><option value="exclude">공백 제외</option></select></Field></div>
      </section>;
    })}</div>
    <button className="button essay-add-question" type="button" disabled={locked} onClick={addQuestion}><Plus size={16} aria-hidden="true"/>문항 추가하기</button>
    <p className="essay-questions-hint" role="status">새 문항 {form.questions.length}개 · 답변은 문항별로 따로 작성합니다.</p>
    {error&&<p className="error-banner" role="alert">{error}</p>}
    <div className="form-footer"><button type="button" className="button" disabled={locked} onClick={close}>취소</button><button type="submit" className="button primary" disabled={locked||!data.jobs.length}>{submitting?'문항 저장 중…':`${form.questions.length}개 문항 저장하고 시작`}</button></div>
  </form></Modal>;
}

export function EssayBack({onClick}) {return <button className="text-button library-back" onClick={onClick}><ArrowLeft size={16}/> 자소서 목록으로</button>;}
export function SavedReview({essay,draft=essay.draft,question=essay.question}) {
  const review=essay.reviews?.at(-1);
  return review?<section className="saved-review"><h3>최근 검토 피드백</h3><small>{new Date(review.createdAt).toLocaleString('ko-KR')} · {review.model}</small>{(review.draftSnapshot!==draft||review.questionSnapshot!==question)&&<p className="review-stale">피드백을 받은 뒤 글이나 문항이 바뀌었어요. 아래 의견은 이전 내용 기준입니다.</p>}<div className="review-text">{review.text}</div></section>:null;
}
