import React from 'react';
import {ArrowUpRight,Pencil,MessageCircle} from 'lucide-react';
import './briefing-mock.css';

// Summarize the owner's saved deadlines and essay progress without an AI request.
export function BriefingMock({notices,onOpen,variant}){
  const focus=notices.find(item=>item.days<=7);
  const next=notices.find(item=>item.days<=7&&item.job.id!==focus?.job.id);
  const company=focus?.job.company;
  const notebook=variant==='notion-cal';
  if(notebook)return <section className="bm-briefing nc-briefing" aria-labelledby="bm-title">
    <div className="bm-heading"><div className="bm-identity"><span className="bm-mark" aria-hidden="true"><MessageCircle size={19}/></span><h2 id="bm-title">오늘의 준비 브리핑</h2></div></div>
    <div className="bm-summary nc-briefing-note">
      <p className="nc-briefing-lead">{focus?<><strong>{company}</strong> {focus.days===0?<strong>오늘 마감</strong>:<>마감까지 <strong>{focus.days}일</strong></>}{focus.days===0?'입니다.':' 남았습니다.'}</>:'7일 이내에 마감되는 미지원 공고가 없습니다.'}</p>
      <p className="nc-briefing-detail">{focus?(focus.written===0?'아직 저장된 자소서가 없습니다. 오늘은 초안 작성을 우선하세요.':'저장한 자소서의 누락 문항과 제출 조건을 확인하세요.'):'관심 공고에서 지원할 공고와 일정을 확인하세요.'}</p>
    </div>
    <div className="bm-actions nc-briefing-actions">
      <button className="bm-action nc-primary-action" onClick={()=>onOpen(focus?'essays':'jobs',focus?.job.id)}><Pencil size={14} aria-hidden="true"/>{focus?(focus.written===0?'초안 작성하기':'자소서 확인하기'):'관심 공고 보기'}</button>
      {focus&&<button className="nc-posting-link" onClick={()=>onOpen('jobs',focus.job.id)}>공고 보기<ArrowUpRight size={14} aria-hidden="true"/></button>}
    </div>
  </section>;
  return <section className="bm-briefing" aria-labelledby="bm-title">
    <div className="bm-heading"><div className="bm-identity"><span className="bm-mark" aria-hidden="true">{notebook?<MessageCircle size={19}/>:"m."}</span><h2 id="bm-title">오늘의 준비 브리핑</h2></div></div>
    <div className="bm-summary">
      <p className="bm-kicker">{notebook?'오늘의 우선순위':'먼저 할 일'}</p>
      <h3>{focus?<><span className="bm-focus-company">{company}</span><br className="bm-mobile-break"/>{focus.written===0?(notebook?' 자소서 초안 작성':' 초안부터 시작해 볼까요?'):(notebook?' 자소서 최종 점검':' 자소서를 점검해 볼까요?')}</>:(notebook?'관심 공고 등록':'관심 있는 공고부터 모아볼까요?')}</h3>
      <p className="bm-reason">{focus?<>{focus.days===0?(notebook?'오늘 마감입니다.':'오늘이 마감일이에요.'):<>마감까지 <strong>{focus.days}일</strong>{notebook?' 남았습니다.':' 남았어요.'}</>} {focus.written===0?(notebook?'저장된 본문이 없습니다. 문항을 확인하고 초안을 작성하세요.':'저장된 자소서 본문이 없어, 먼저 문항을 확인하고 초안을 쓰는 것을 추천해요.'):(notebook?'저장한 본문을 공고의 요구사항과 비교하고, 빠진 문항을 확인하세요.':'작성한 내용을 공고의 요구사항과 비교하고, 빠진 문항이 없는지 확인해 보세요.')}</>:(notebook?'공고를 등록하면 마감일과 작성 상태를 기준으로 우선순위를 표시합니다.':'공고를 저장하면 마감일과 작성 상태를 바탕으로 오늘 할 일을 제안하는 자리예요.')}</p>
      <div className="bm-actions"><button className="bm-action" onClick={()=>onOpen('jobs',focus?.job.id)}>공고 보기<ArrowUpRight size={14} aria-hidden="true"/></button><button className="bm-action" onClick={()=>onOpen('essays',focus?.job.id)}><Pencil size={14} aria-hidden="true"/>초안 작성하기</button></div>
      {next&&<div className="bm-next"><span>그다음</span><p><strong>{next.job.company}</strong> 지원 준비 확인</p><span className="bm-next-date">D-{next.days}</span></div>}
    </div>
  </section>;
}
