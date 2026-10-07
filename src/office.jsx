import React,{useState,useEffect,useRef} from 'react';
import {Settings,BookOpen,BriefcaseBusiness,FileText,ClipboardList,ChevronRight,ArrowLeft,MessageCircle,Sun,Leaf,X,FolderOpen,Check,ArrowUpRight} from 'lucide-react';
import {useOffice,Avatar} from './ui.jsx';
import {DeadlineBoard} from './deadline-board.jsx';
import {WorkCompanion} from './colleague-reactions.jsx';
import {PixelDeskMotion,useRoomVisibility} from './pixel-desk-motion.jsx';
import {DocumentWorkspace} from './document-workspace.jsx';

const colleagues=[
  {id:'noa',name:'노아',role:'공고와 방향성',type:'owl',x:37,y:38,greeting:'어떤 공고를 살펴볼까요?',line:'공고의 요구 조건과 내 경험을 비교해 보세요.',actions:[['jobs','공고 함께 살펴보기'],['direction','나의 다음 한 걸음 찾기']]},
  {id:'daram',name:'다람',role:'경험 정리',type:'squirrel',x:62.5,y:38,greeting:'어떤 경험부터 정리할까요?',line:'직접 한 행동과 배운 점을 따로 적어보세요.',actions:[['experience-new','새 경험 정리하기'],['experiences','쌓아둔 경험 돌아보기']]},
  {id:'mori',name:'모리',role:'자기소개서',type:'cat',x:36.3,y:57.8,greeting:'오늘은 어떤 자기소개서를 작업할까요?',line:'공고와 경험을 참고해 문항을 작성하세요.',actions:[['essays','자소서 쓰기'],['review','검토받기']]},
  {id:'tori',name:'토리',role:'지원 기록',type:'dog',x:63.7,y:57.8,greeting:'지원 내역을 기록하거나 확인해 보세요.',line:'지원한 회사와 접수 상태를 확인하세요.',actions:[['applications','지원 관리']]}
];
export const ownerForPage={jobs:'noa',direction:'noa',experiences:'daram','experience-new':'daram',essays:'mori',review:'mori',applications:'tori'};
const deskTasks={noa:'공고 살펴보기',daram:'경험 정리',mori:'자소서 쓰기',tori:'지원 관리'};
const pageNames={jobs:'관심 공고',direction:'방향성 노트',experiences:'내 경험 보관함','experience-new':'새 경험 정리',essays:'자소서 쓰기',review:'검토받기',applications:'지원 관리',settings:'내 정보와 설정'};

export function OfficeShell({page,children}) {
  const {data,workspace,navigate,switchWorkspace,busy,toast,handoff,setHandoff}=useOffice();
  const [talk,setTalk]=useState(null);
  const [request,setRequest]=useState(null);const [motion,setMotion]=useState(true);
  const roomHidden=useRoomVisibility();
  const workRef=useRef(null);const lastTrigger=useRef(null);
  const isWorking=page!=='home';
  const owner=colleagues.find(c=>c.id===ownerForPage[page]);
  useEffect(()=>{
    if(!handoff)return;
    lastTrigger.current=document.getElementById(`desk-${handoff.to}`);
    setTalk(colleagues.find(c=>c.id===handoff.to));
  },[handoff]);
  useEffect(()=>{if(isWorking)setTalk(null);},[isWorking]);
  const date=new Intl.DateTimeFormat('ko-KR',{month:'long',day:'numeric',weekday:'short',timeZone:'Asia/Seoul'}).format(new Date());
  const openTalk=(person,event)=>{
    setHandoff(null);
    lastTrigger.current=event.currentTarget;
    if(person.id==='tori'){openWork('applications');return;}
    setTalk(person);
  };
  const closeTalk=()=>{setTalk(null);setHandoff(null);requestAnimationFrame(()=>lastTrigger.current?.focus());};
  const openWork=(target,job,essay)=>{if(navigate(target,job,essay)!==false){setRequest({id:crypto.randomUUID(),page:target});setTalk(null);}};
  useEffect(()=>{if(!isWorking)return;const d=workRef.current;d.showModal();return()=>d.close();},[isWorking]);
  const leaveWork=()=>{if(navigate('home')!==false){requestAnimationFrame(()=>lastTrigger.current?.focus());}};
  return <main className={`office-world nh-shell notion-cal-home initial-blue-world ${isWorking?'working':''} ${motion?'':'keyboard-input'} ${isWorking||talk||roomHidden?'pixel-motion-paused':''}`} onPointerDownCapture={()=>setMotion(true)} onPointerMoveCapture={()=>{if(!motion)setMotion(true);}} onKeyDownCapture={()=>setMotion(false)}>
    <InitialBlueNav page="home" onOpen={openWork} onHome={leaveWork} workspace={workspace} busy={busy} onSwitch={()=>switchWorkspace(workspace==='demo'?'personal':'demo')}/>
    <div className="nh-main initial-home-content" hidden={isWorking}>
      <div className="nh-intro"><p className="nh-date">{date}</p><div className="nh-greeting-row"><div><h1>나의 취업 준비</h1><p className="nh-description">공고와 경험, 자기소개서, 지원 기록을 한곳에서 관리하세요.</p></div></div></div>
      <div className="initial-home-columns">
        <section className="initial-work-list" aria-labelledby="initial-work-heading">
          <div className="nh-section-heading"><h2 id="initial-work-heading">준비할 일</h2></div>
          {colleagues.map(person=>{const Icon=({noa:BriefcaseBusiness,daram:FolderOpen,mori:FileText,tori:ClipboardList})[person.id];return <button id={`desk-${person.id}`} key={person.id} className="initial-work-row" onClick={e=>openTalk(person,e)} aria-label={`${deskTasks[person.id]} · ${person.name}에게 말 걸기`} aria-haspopup="dialog" aria-expanded={talk?.id===person.id}>
            <span className="initial-work-icon"><Icon size={21}/></span><span><strong>{person.role}</strong><small>{person.line}</small></span><ChevronRight size={17} aria-hidden="true"/>
          </button>;})}
          <button className="initial-profile-link" aria-label="기본 정보 보관함 열기" onClick={()=>openWork('settings')}><BookOpen size={17}/><span>내 정보 · 설정</span><ArrowUpRight size={15}/></button>
        </section>
        <DeadlineBoard data={data} onOpen={openWork}/>
      </div>
    </div>
    {talk&&<Conversation person={talk} handoff={handoff} onClose={closeTalk} onWork={target=>openWork(target,handoff?.page===target?handoff.jobId:undefined,handoff?.page===target?handoff.essayId:undefined)} motion={motion}/>}
    {isWorking&&<dialog ref={workRef} className={`room-workspace full-workspace document-workspace-dialog blue-workspace initial-blue-workspace ${page==='essays'?'essay-workspace-dialog':''}`} aria-label={pageNames[page]} onCancel={e=>{e.preventDefault();leaveWork();}}>
      <InitialBlueNav page={page} onOpen={openWork} onHome={leaveWork} workspace={workspace} busy={busy} onSwitch={()=>switchWorkspace(workspace==='demo'?'personal':'demo')}/>
      <div className="initial-work-context"><button onClick={leaveWork} className="initial-home-back"><ArrowLeft size={15}/>홈으로</button><span>{pageNames[page]}</span><button onClick={leaveWork} aria-label="작업 창 닫기"><X size={18}/></button></div>
      <WorkCompanion key={`companion-${page}`} owner={owner} page={page} request={request?.page===page?request:null} motion={motion}/>
      <div className="room-work-content" key={`content-${page}`}>{page==='essays'?children:<DocumentWorkspace page={page}>{children}</DocumentWorkspace>}</div>{toast&&<div className="workspace-feedback" role="status"><Check size={16}/>{toast}</div>}
    </dialog>}
    {!isWorking&&children}
  </main>;
}

const messageCopy={
  noa:['공고부터 같이 살펴볼까요?','모아둔 공고를 보거나, 어떤 조건이 자주 나오는지 확인할 수 있어요.'],
  daram:['기억해 두고 싶은 경험이 있나요?','새로운 경험을 정리해도 좋고, 쌓아둔 기록을 함께 돌아봐도 좋아요.'],
  mori:['오늘은 어떤 글을 같이 볼까요?','쓰던 글을 이어 쓰셔도 좋고, 완성한 글을 검토해도 좋아요.']
};

export function Conversation({person,handoff,onClose,onWork}) {
  const {data}=useOffice();
  const ref=useRef(null);
  const [openedAt]=useState(()=>new Date());
  useEffect(()=>{const dialog=ref.current;dialog.showModal();return()=>dialog.close();},[]);
  const job=data.jobs.find(j=>j.id===handoff?.jobId);
  const source=colleagues.find(c=>c.id===handoff?.from);
  const messages=handoff?[`${source?.name||'동료'}와 하던 일을 이어서 도와드릴게요.`,job?`${job.company} · ${job.role} 공고를 가져왔어요. 이 공고로 이어서 시작할까요?`:`${pageNames[handoff.page]}에서 필요한 기록을 함께 살펴봐요.`]:messageCopy[person.id]||[person.greeting,person.line];
  const actions=handoff?person.actions.filter(([route])=>route===handoff.page):person.actions;
  const time=new Intl.DateTimeFormat('ko-KR',{hour:'numeric',minute:'2-digit',timeZone:'Asia/Seoul'}).format(openedAt);
  return <dialog ref={ref} className="colleague-conversation office-messenger" aria-label={`${person.name} · 사내 메시지`} onCancel={e=>{e.preventDefault();onClose();}}>
    <div className="messenger-title"><MessageCircle size={13} aria-hidden="true"/><span>사내 메시지</span><span className="messenger-team">나의 취업 사무실</span></div>
    <header className="messenger-header">
      <span className="messenger-avatar"><Avatar type={person.type} size={40}/></span>
      <div className="messenger-person"><strong>{person.name}</strong><span>{person.role} 담당</span></div>
      <button className="messenger-close" onClick={onClose} aria-label="메시지 닫기"><X size={19}/></button>
    </header>
    <div className="messenger-thread">
      <div className="messenger-date"><span/>오늘<span/></div>
      <div className="messenger-incoming"><Avatar type={person.type} size={28}/><div className="messenger-message-group">
        <span className="messenger-sender">{person.name}</span>
        {messages.map((message,index)=><p className="messenger-bubble" key={index}>{message}</p>)}
        <time className="messenger-time" dateTime={openedAt.toISOString()}>{time}</time>
        <div className="messenger-inline-choices">
          <span className="messenger-choice-label">이어서 할 일</span>
          <div className="messenger-reply-options" role="group" aria-label="보낼 답장 선택">{actions.map(([route,label])=><button key={route} onClick={()=>onWork(route)}><span>{label}</span><ArrowUpRight size={16} aria-hidden="true"/></button>)}</div>
        </div>
      </div></div>
    </div>
    <footer className="messenger-replies">
      <p className="messenger-reply-prompt"><MessageCircle size={15} aria-hidden="true"/><span>위에서 답장을 골라주세요.</span></p>
    </footer>
  </dialog>;
}

// Presentation only: all actions delegate to the original OfficeShell handlers.
function InitialBlueNav({page,onOpen,onHome,workspace,busy,onSwitch}) {
  const links=[['home','홈'],['jobs','관심 공고'],['essays','자기소개서'],['experiences','경험 보관함'],['applications','지원 현황'],['direction','방향성 노트']];
  return <header className="nh-topnav initial-blue-nav"><div className="nh-topnav-inner">
    <button className="nh-topnav-brand" onClick={onHome} aria-label="모아 홈"><strong>모아<span className="ch-brand-dot">.</span></strong></button>
    <div className="nh-topnav-links"><nav aria-label="메인 메뉴">{links.map(([route,label])=><button key={route} onClick={()=>route==='home'?onHome():onOpen(route)} className={page===route?'is-current':''} aria-current={page===route?'page':undefined}>{label}</button>)}</nav>
      <div className="nh-topnav-actions"><button className="nh-icon" onClick={()=>onOpen('settings')} aria-label="내 정보 · 설정"><Settings size={18}/></button><button className="nh-workspace-switch" disabled={busy} onClick={onSwitch}>{workspace==='demo'?'샘플 공간':'개인 공간'}<ArrowUpRight size={13}/></button></div>
    </div>
  </div></header>;
}