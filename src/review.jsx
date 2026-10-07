import React,{useEffect,useRef,useState} from 'react';
import {useOffice,PageHeading,Modal,Notice,uid,now} from './ui.jsx';
import {EssayLibrary,EssayBack,SavedReview} from './essay-library.jsx';
import {useGuard} from './helpers.jsx';
import {buildReviewRequest} from '../lib/essay-review.mjs';

export function ReviewPage() {
  const {data,selectedEssayId,setSelectedEssayId}=useOffice();
  const essay=data.essays.find(e=>e.id===selectedEssayId);
  const job=data.jobs.find(j=>j.id===essay?.jobId);
  return essay&&job?<ReviewDetail key={essay.id} essay={essay} job={job} onBack={()=>setSelectedEssayId(null)}/>:<EssayLibrary review onSelect={setSelectedEssayId}/>;
}
function ReviewDetail({essay,job,onBack}) {
  const {data,commit,busy,navigate,setDirty}=useOffice();
  const [preview,setPreview]=useState(null);const [result,setResult]=useState(null);
  const [pending,setPending]=useState(false);const [error,setError]=useState('');
  const controller=useRef(null);const active=useRef(true);
  useGuard(!!result||pending);
  useEffect(()=>{active.current=true;return()=>{active.current=false;controller.current?.abort();};},[]);
  const back=()=>{if((result||pending)&&!confirm('저장하지 않은 피드백이나 진행 중인 요청이 있어요. 목록으로 돌아갈까요?'))return;controller.current?.abort();setDirty(false);onBack();};
  const prepare=()=>{
    if(result&&!confirm('저장하지 않은 피드백이 있어요. 새 피드백을 받을까요?'))return;
    const prompt=data.prompts.filter(p=>p.stage==='퇴고'&&p.active).at(-1);
    const requestText=buildReviewRequest({essay,job,experiences:data.experiences,prompt});
    if(requestText.length>60000){setError('공고·경험·본문을 합친 요청문이 60,000자를 넘었어요. 자료 분량을 줄여 주세요.');return;}
    setError('');setPreview({requestText,draftSnapshot:essay.draft,questionSnapshot:essay.question});
  };
  const generate=async()=>{
    if(controller.current)return;
    const source=preview;const abort=new AbortController();controller.current=abort;setPending(true);setError('');
    try{
      const response=await fetch('/api/ai/review',{method:'POST',headers:{'Content-Type':'application/json'},signal:abort.signal,body:JSON.stringify({requestText:source.requestText,consent:true})});
      const payload=await response.json();if(!response.ok)throw Error(payload.error||'피드백을 받지 못했어요.');
      if(!active.current||abort.signal.aborted)return;
      if(typeof payload.text!=='string'||!payload.text.trim())throw Error('피드백 내용이 비어 있어요. 다시 시도해 주세요.');
      setResult({id:uid(),text:payload.text,model:payload.model,createdAt:payload.generatedAt||now(),draftSnapshot:source.draftSnapshot,questionSnapshot:source.questionSnapshot});setPreview(null);
    }catch(e){if(active.current)setError(abort.signal.aborted?'요청을 취소했어요. 저장된 글은 그대로입니다.':e.message);}
    finally{controller.current=null;if(active.current)setPending(false);}
  };
  const save=async(edit=false)=>{
    if(pending||busy)return;
    if(result){const feedback=result;const ok=await commit(s=>{const entry=s.essays.find(e=>e.id===essay.id);entry.reviews??=[];if(!entry.reviews.some(r=>r.id===feedback.id))entry.reviews.push(feedback);},'피드백을 저장했어요. 자소서 원문은 그대로예요');if(!ok)return;setResult(null);}
    setDirty(false);if(edit)navigate('essays',job.id,essay.id);
  };
  return <><EssayBack onClick={back}/><PageHeading eyebrow="자소서 검토" title="검토받기" description={`${job.company} · ${job.role}`}/><div className="review-layout"><section className="card"><h2>{essay.question}</h2><p className="helper">저장한 본문 · {essay.limit}자 기준</p><div className="review-original">{essay.draft||'본문을 먼저 작성하고 저장해 주세요.'}</div><button className="button" disabled={pending||busy} onClick={()=>save(true)}>{result?'피드백 저장하고 수정하기':'이 글 수정하기'}</button></section><section className="card review-feedback"><h2>검토 피드백</h2><p>공고와 선택한 경험을 기준으로 좋은 점, 보완할 점, 문장별 제안을 받습니다.</p><button className="button primary" disabled={pending||busy||!essay.draft.trim()} onClick={prepare}>{pending?'검토 중…':result||essay.reviews?.length?'다시 검토받기':'AI 검토 요청'}</button>{error&&!preview&&<p role="alert" className="review-error">{error}</p>}{result?<><p className="helper">새 피드백 · 아직 저장하지 않았어요</p><div className="review-text" aria-live="polite">{result.text}</div><div className="action-row"><button className="button" disabled={busy} onClick={()=>save(false)}>피드백 저장</button><button className="button primary" disabled={busy} onClick={()=>save(true)}>저장하고 수정하기</button></div></>:<SavedReview essay={essay}/>}<p className="helper">피드백은 참고 의견입니다. 원문은 자동 수정되지 않으며, 실제 경험과 맞는지 확인하며 다듬어 주세요.</p></section></div>{preview&&<Modal title="검토할 자료 확인" wide onClose={()=>{controller.current?.abort();setPreview(null);}}><Notice>아래 공고·문항·본문·선택한 경험과 검토 지시문을 Google Gemini에 보냅니다. 전송 버튼을 누를 때만 실행됩니다.</Notice><textarea aria-label="검토 요청문" readOnly rows={15} value={preview.requestText}/>{error&&<p role="alert" className="review-error">{error}</p>}<div className="form-footer"><button className="button" onClick={()=>{controller.current?.abort();setPreview(null);}}>취소</button><button className="button primary" disabled={pending} onClick={generate}>{pending?'검토 중…':'위 내용을 Gemini에 보내고 검토받기'}</button></div></Modal>}</>;
}
