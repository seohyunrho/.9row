import React,{useEffect,useRef,useState} from 'react';
import {Check,FileSearch,FolderOpen,PencilLine,Stamp,AlertCircle,BookOpen} from 'lucide-react';
import {Avatar,useOffice} from './ui.jsx';

const tools={owl:FileSearch,squirrel:FolderOpen,cat:PencilLine,dog:Stamp};
const welcome={owl:'공고와 요구 조건을 확인할 수 있어요.',squirrel:'역할과 결과를 중심으로 경험을 정리하세요.',cat:'공고와 경험을 참고해 문항을 작성하세요.',dog:'회사·직무·지원일을 기록하고 확인하세요.'};
const resting={owl:'공고의 조건과 내 경험을 비교해 보세요.',squirrel:'직접 한 행동과 결과를 구분해 보세요.',cat:'작성한 내용은 새 버전으로 저장할 수 있어요.',dog:'접수 완료 여부를 확인한 뒤 기록하세요.'};

// A single, interruptible acknowledgement. No looping movement while reading.
export function ReactionAvatar({type='cat',size=54,cue,phase='idle',motion=true}) {
  const {data}=useOffice();
  const ref=useRef(null);
  const reduced=Boolean(data.preferences.reducedMotion);
  useEffect(()=>{
    if(!cue||!motion||reduced||!['accepted','success'].includes(phase))return;
    const media=window.matchMedia('(prefers-reduced-motion: reduce)');
    if(media.matches)return;
    if(!ref.current)return;
    const animation=ref.current.animate([
      {transform:'translateY(3px)',opacity:0},
      {transform:'translateY(0)',opacity:1}
    ],{duration:160,easing:'cubic-bezier(0.23, 1, 0.32, 1)'});
    const stop=()=>{if(media.matches)animation.cancel();};
    media.addEventListener('change',stop);
    return()=>{animation.cancel();media.removeEventListener('change',stop);};
  },[cue,phase,type,motion,reduced]);
  const Tool=phase==='success'?Check:phase==='error'?AlertCircle:(tools[type]||BookOpen);
  return <span className={`reaction-avatar phase-${phase}`}>
    <span className="reaction-art"><Avatar type={type} size={size}/></span>
    {phase!=='idle'&&<span className="reaction-tool" ref={ref} aria-hidden="true"><Tool size={16}/></span>}
  </span>;
}

export function WorkCompanion({owner,page,request,motion}) {
  const {busy,saveFeedback,workspace}=useOffice();
  const [active,setActive]=useState(null);
  const seenFeedback=useRef(saveFeedback?.id);
  const [welcoming,setWelcoming]=useState(Boolean(request));
  useEffect(()=>{
    setWelcoming(Boolean(request));
    if(!request)return;
    const timer=setTimeout(()=>setWelcoming(false),2400);
    return()=>clearTimeout(timer);
  },[request]);
  useEffect(()=>{
    if(!saveFeedback||seenFeedback.current===saveFeedback.id)return;
    seenFeedback.current=saveFeedback.id;
    if(saveFeedback.workspace!==workspace||saveFeedback.page!==page)return;
    setActive(saveFeedback);
    const timer=setTimeout(()=>setActive(null),saveFeedback.status==='error'?6000:3500);
    return()=>clearTimeout(timer);
  },[saveFeedback,workspace,page]);
  const phase=busy?'busy':active?.status||(welcoming?'accepted':'idle');
  const message=busy?'변경사항을 저장하고 있어요.':phase==='success'?'변경사항을 저장했어요.':phase==='error'?'저장하지 못했어요. 오류 안내를 확인해 주세요.':welcoming?(welcome[owner?.type]||'지원서에 사용할 이력을 정리하세요.'):(resting[owner?.type]||'정확한 정보를 입력하고 저장해 주세요.');
  return <div className={`work-companion-strip phase-${phase}`}>
    <ReactionAvatar type={owner?.type||'squirrel'} size={40} cue={active?.id||request?.id} phase={phase} motion={motion}/>
    <div><span className="companion-caption">{owner?`${owner.name} · ${owner.role}`:'기본 정보'}</span><p role="status" aria-live="polite">{message}</p></div>
    <span className="companion-state">{busy?'저장 중':phase==='success'?'저장 완료':phase==='error'?'확인 필요':'작업 안내'}</span>
  </div>;
}
