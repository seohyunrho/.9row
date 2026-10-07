import React,{useEffect,useRef,useState} from 'react';
import {Home,BriefcaseBusiness,FileText,FolderOpen,Compass,Settings,ArrowUpRight,ArrowRight,ArrowLeft,Plus,Check,ChevronRight,ChevronLeft,ChevronDown,CheckCheck,Menu,X,Pencil,Trash2} from 'lucide-react';
import {useOffice,dateToday,formatDate} from './ui.jsx';
import {DocumentWorkspace} from './document-workspace.jsx';
import {BriefingMock} from './briefing-mock.jsx';
import {deadlineNotices} from '../lib/deadline-notices.mjs';

const navigation=[['home','홈',Home],['jobs','관심 공고',BriefcaseBusiness],['essays','자기소개서',FileText],['experiences','경험 보관함',FolderOpen],['applications','지원 현황',CheckCheck],['direction','방향성 노트',Compass]];
const pageNames=Object.fromEntries([...navigation.map(([id,name])=>[id,name]),['settings','내 정보 · 설정'],['review','자소서 검토'],['experience-new','새 경험 정리']]);
const dayNumber=date=>Date.parse(`${date}T00:00:00Z`)/86400000;
const dateKey=(year,month,day)=>`${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
const deadlineLabel=days=>days===0?'오늘 마감':`D-${days}`;

export function CalShell({page,children}){
  const {data,workspace,navigate,switchWorkspace,busy,toast}=useOffice();
  const [mobileNav,setMobileNav]=useState(false);
  const homeDesign='notion-cal';

  const [today,setToday]=useState(dateToday);
  const homeRef=useRef(null),todoRef=useRef(null);
  const isWorking=page!=='home';
  useEffect(()=>{const refresh=()=>setToday(dateToday());const timer=setInterval(refresh,60000);document.addEventListener('visibilitychange',refresh);return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',refresh);};},[]);
  const open=(target,jobId,essayId)=>{if(navigate(target,jobId,essayId)!==false)setMobileNav(false);};
  const notices=deadlineNotices(data,today).sort((a,b)=>a.days-b.days||a.job.id.localeCompare(b.job.id));
  const soon=notices.filter(item=>item.days<=7);
  const dateText=new Intl.DateTimeFormat('ko-KR',{month:'long',day:'numeric',weekday:'long',timeZone:'Asia/Seoul'}).format(new Date(`${today}T12:00:00+09:00`));
  return <div className="nh-shell notion-cal-home">
    <a href={isWorking?'#workspace-main':'#nh-main'} className="nh-skip" onClick={e=>{e.preventDefault();document.getElementById(isWorking?'workspace-main':'nh-main')?.focus();}}>본문으로 이동</a>
    <header className="nh-topnav">
      <div className="nh-topnav-inner">
        <button ref={homeRef} className="nh-topnav-brand" onClick={()=>open('home')} aria-label="모아 홈"><strong>모아<span className="ch-brand-dot">.</span></strong></button>
        <button className="nh-icon nh-menu-toggle" aria-label={mobileNav?'메뉴 접기':'메뉴 펼치기'} aria-expanded={mobileNav} aria-controls="nh-navigation" onClick={()=>setMobileNav(!mobileNav)}>{mobileNav?<X size={20}/>:<Menu size={20}/>}</button>
        <div className={`nh-topnav-links ${mobileNav?'is-open':''}`} id="nh-navigation">
          <nav aria-label="메인 메뉴">{navigation.map(([id,label])=><button key={id} onClick={()=>open(id)} className={page===id?'is-current':''} aria-current={page===id?'page':undefined}>{label}</button>)}</nav>
          <div className="nh-topnav-actions"><button className="nh-icon" onClick={()=>open('settings')} aria-label="내 정보 · 설정"><Settings size={18}/></button><button className="nh-workspace-switch" disabled={busy} onClick={()=>switchWorkspace(workspace==='demo'?'personal':'demo')} aria-label={workspace==='demo'?'내 공간으로 전환':'샘플 공간으로 전환'}>{workspace==='demo'?'샘플 공간':'개인 공간'}<ArrowRight size={13} aria-hidden="true"/></button></div>
        </div>
      </div>
    </header>
    <div className="nh-main-shell" hidden={isWorking}>
      <main id="nh-main" className="nh-main" tabIndex={-1}>
        <div className="nh-intro"><div className="nh-greeting-row"><div><p className="nh-date">{dateText}</p><h1>나의 취업 준비<span className="mh-title-dot" aria-hidden="true">.</span></h1><p className="nh-description">{soon.length?<>7일 안에 마감되는 공고가 <strong>{soon.length}개</strong> 있어요.</>:'7일 안에 마감되는 공고가 없어요.'}</p></div></div></div>
        <div className="nh-home-columns"><div className="nh-primary-column">
          <BriefingMock key={`briefing-${workspace}`} notices={notices} onOpen={open} variant={homeDesign}/>
          <Todos key={workspace} workspace={workspace} inputRef={todoRef}/>
          <section className="nh-section nh-continue" aria-labelledby="nh-continue"><div className="nh-section-heading"><h2 id="nh-continue">자기소개서 이어가기</h2><button className="nh-text-button" onClick={()=>open('essays')}>전체 보기<ArrowUpRight size={14}/></button></div>{data.essays.length?<div>{[...data.essays].sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||''))).slice(0,3).map(essay=>{const job=data.jobs.find(j=>j.id===essay.jobId);return <button className="nh-document-row" key={essay.id} onClick={()=>open('essays',essay.jobId,essay.id)}><span className="nh-document-icon"><FileText size={19}/></span><span><strong>{job?.company||'공고 미연결'}<small>{job?.role}</small></strong><span>{essay.question||'새 자기소개서 문항'}</span></span><span className="nh-draft-state">{essay.draft?.trim()?'작성 중':'작성 전'}</span><ChevronRight size={16}/></button>;})}</div>:<div className="nh-inline-empty">첫 문항부터 차근차근 시작해 보세요.<button className="nh-text-button" onClick={()=>open('essays')}>자소서 쓰기<ArrowRight size={14}/></button></div>}</section>
        </div><aside className="nh-secondary-column" aria-label="채용 달력과 도구"><Schedule data={data} today={today} onOpen={open}/><div className="ch-utility-links"><button onClick={()=>open('experience-new')}><Plus size={15} aria-hidden="true"/>경험 기록하기</button><button onClick={()=>open('review')}><FileText size={15} aria-hidden="true"/>자소서 검토하기</button></div></aside></div>
        {!isWorking&&children}
      </main>
    </div>
    {isWorking&&<main id="workspace-main" tabIndex={-1} className={`document-workspace-dialog blue-workspace ${page==='jobs'?'cal-jobs-workspace':''} ${page==='essays'?'essay-workspace-dialog':''}`} aria-label={pageNames[page]}><div className="room-work-content" key={`content-${page}`}>{page==='essays'?children:<DocumentWorkspace page={page}>{children}</DocumentWorkspace>}</div>{toast&&<div className="workspace-feedback" role="status"><Check size={16}/>{toast}</div>}</main>}
  </div>;
}



function readTodos(key,workspace){
  const stored=localStorage.getItem(key);
  if(stored===null)return [];
  const items=JSON.parse(stored);
  if(!Array.isArray(items)||items.some(item=>!item||typeof item.id!=='string'||typeof item.text!=='string'||typeof item.done!=='boolean'))throw Error('invalid');
  return items;
}
function Todos({workspace,inputRef}){
  const key=`moa-home-todos-v1:${workspace}`;
  const [initial]=useState(()=>{try{return {items:readTodos(key,workspace),failed:false};}catch{return {items:[],failed:true};}});
  const [items,setItems]=useState(initial.items),[text,setText]=useState(''),[filter,setFilter]=useState('all'),[editing,setEditing]=useState(null),[editText,setEditText]=useState(''),[removed,setRemoved]=useState(null),[message,setMessage]=useState('');
  const completed=items.filter(item=>item.done).length;
  const save=next=>{if(initial.failed)return false;try{localStorage.setItem(key,JSON.stringify(next));setItems(next);setMessage('저장했어요.');return true;}catch{setMessage('저장하지 못했어요. 브라우저 저장 공간을 확인해 주세요.');return false;}};
  const add=e=>{e.preventDefault();if(!text.trim())return;if(save([...items,{id:crypto.randomUUID(),text:text.trim(),done:false}])){setText('');setFilter('all');inputRef.current?.focus();}};
  const visible=items.filter(item=>filter==='all'||(filter==='done'?item.done:!item.done));
  return <section className="nh-section nh-todos" aria-labelledby="nh-todos-title"><div className="nh-section-heading"><h2 id="nh-todos-title">나의 할 일</h2><span className="nh-completion">{completed} / {items.length} 완료</span></div><div className="nh-todo-toolbar"><div role="group" aria-label="할 일 필터">{[['all','전체'],['active','할 일'],['done','완료']].map(([value,label])=><button key={value} aria-pressed={filter===value} onClick={()=>setFilter(value)}>{label}</button>)}</div><span className="nh-todo-meter" role="progressbar" aria-label="할 일 완료 비율" aria-valuenow={items.length?Math.round(completed/items.length*100):0} aria-valuemin={0} aria-valuemax={100}><span style={{width:`${items.length?completed/items.length*100:0}%`}}/></span></div>
    {initial.failed?<p className="nh-storage-error" role="alert">저장된 할 일을 읽지 못했어요. 기존 내용은 보존되어 있습니다.</p>:<><ul className="nh-todo-list">{visible.map(item=><li key={item.id} className={item.done?'is-done':''}>{editing===item.id?<form className="nh-todo-edit" onSubmit={e=>{e.preventDefault();if(editText.trim()&&save(items.map(t=>t.id===item.id?{...t,text:editText.trim()}:t)))setEditing(null);}}><input autoFocus aria-label="할 일 수정" value={editText} maxLength={200} onChange={e=>setEditText(e.target.value)} onKeyDown={e=>{if(e.key==='Escape')setEditing(null);}}/><button className="nh-icon" type="submit" aria-label="수정 저장"><Check size={16}/></button><button className="nh-icon" type="button" aria-label="수정 취소" onClick={()=>setEditing(null)}><X size={16}/></button></form>:<><label><input type="checkbox" checked={item.done} onChange={()=>save(items.map(t=>t.id===item.id?{...t,done:!t.done}:t))}/><span>{item.text}</span></label><button className="nh-icon" onClick={()=>{setEditing(item.id);setEditText(item.text);}} aria-label={`${item.text} 수정`}><Pencil size={14}/></button><button className="nh-icon" onClick={()=>{if(save(items.filter(t=>t.id!==item.id)))setRemoved(item);}} aria-label={`${item.text} 삭제`}><Trash2 size={14}/></button></>}</li>)}</ul>{!visible.length&&<p className="nh-no-todos">{filter==='done'?'완료한 할 일이 여기에 모입니다.':filter==='active'?'할 일을 모두 마쳤어요. 잠시 쉬어가세요.':'오늘 해볼 작은 일 하나를 적어보세요.'}</p>}<form className="nh-todo-add" onSubmit={add}><Plus size={17} aria-hidden="true"/><input ref={inputRef} aria-label="새 할 일" placeholder="새로운 할 일을 적어보세요" value={text} maxLength={200} onChange={e=>setText(e.target.value)}/><button type="submit" disabled={!text.trim()} aria-label="할 일 저장"><ArrowRight size={17}/></button></form></>}
    <div className="nh-todo-footer"><small>이 브라우저에 자동 저장</small>{removed?<button className="nh-text-button" onClick={()=>{if(save([...items,removed]))setRemoved(null);}}>삭제 취소</button>:<span role="status">{message}</span>}</div>
  </section>;
}

function Schedule({data,today,onOpen}){
  const [expanded,setExpanded]=useState(true);
  const [month,setMonth]=useState(()=>today.slice(0,7));
  const [selected,setSelected]=useState(null);
  const [year,monthIndex]=month.split('-').map(Number);
  const validJobs=data.jobs.filter(j=>/^\d{4}-\d{2}-\d{2}$/.test(j.deadline||'')&&Number.isFinite(dayNumber(j.deadline))&&new Date(dayNumber(j.deadline)*86400000).toISOString().slice(0,10)===j.deadline);
  const nearDeadlines=new Map(deadlineNotices(data,today).filter(item=>item.days<=7).map(item=>[item.job.id,item.days]));
  const upcoming=validJobs.filter(j=>j.deadline>=today).sort((a,b)=>a.deadline.localeCompare(b.deadline));
  const events=selected?validJobs.filter(j=>j.deadline===selected):expanded?validJobs.filter(j=>j.deadline.startsWith(month)).sort((a,b)=>a.deadline.localeCompare(b.deadline)):upcoming.slice(0,3);
  const firstWeekday=new Date(Date.UTC(year,monthIndex-1,1)).getUTCDay();
  const days=new Date(Date.UTC(year,monthIndex,0)).getUTCDate();
  const shift=delta=>{const next=new Date(Date.UTC(year,monthIndex-1+delta,1));setMonth(dateKey(next.getUTCFullYear(),next.getUTCMonth(),1).slice(0,7));setSelected(null);};
  return <section className="nh-schedule" aria-labelledby="nh-schedule-title"><div className="nh-section-heading"><h2 id="nh-schedule-title">채용 일정</h2></div><p className="nh-section-description">공고 마감일</p><button className="nh-calendar-toggle" onClick={()=>{setExpanded(!expanded);setSelected(null);}} aria-expanded={expanded} aria-controls="nh-calendar"><span>{year}년 {monthIndex}월</span><span>{expanded?'달력 접기':'달력 보기'}<ChevronDown size={14} className={expanded?'is-expanded':''}/></span></button>
    {expanded&&<div className="nh-calendar" id="nh-calendar"><div className="nh-calendar-controls"><button className="nh-icon" onClick={()=>shift(-1)} aria-label="이전 달"><ChevronLeft size={17}/></button><button className="nh-text-button" onClick={()=>{setMonth(today.slice(0,7));setSelected(null);}}>이번 달</button><button className="nh-icon" onClick={()=>shift(1)} aria-label="다음 달"><ChevronRight size={17}/></button></div><div className="nh-calendar-grid">{['일','월','화','수','목','금','토'].map(label=><span className="nh-weekday" key={label}>{label}</span>)}{Array.from({length:firstWeekday},(_,i)=><span key={`blank-${i}`}/>)}{Array.from({length:days},(_,i)=>{const day=i+1,date=dateKey(year,monthIndex-1,day),count=validJobs.filter(j=>j.deadline===date).length;return <button className={date===today?'is-today':''} key={date} aria-label={`${monthIndex}월 ${day}일${date===today?', 오늘':''}, 마감 ${count}건`} aria-pressed={selected===date} onClick={()=>setSelected(selected===date?null:date)}><span>{day}</span>{count>0&&<i/>}</button>;})}</div></div>}
    {selected&&<div className="nh-date-filter"><span>{formatDate(selected)} 일정</span><button className="nh-text-button" onClick={()=>setSelected(null)}>전체</button></div>}
    <div className="nh-upcoming-list">{events.length?events.map(job=><button key={job.id} onClick={()=>onOpen('jobs',job.id)}><span className="nh-event-date"><small>{Number(job.deadline.slice(5,7))}월</small><b>{Number(job.deadline.slice(8,10))}</b></span><span className="ch-event-details"><span className="ch-event-company"><strong title={job.company}>{job.company}</strong>{nearDeadlines.has(job.id)&&<span className={`ch-dday ${nearDeadlines.get(job.id)<=3?'is-urgent':''}`}>{deadlineLabel(nearDeadlines.get(job.id))}</span>}</span><small>{job.role}</small></span><ChevronRight size={14} aria-hidden="true"/></button>):<p className="nh-no-events">{selected?'이 날짜에 마감하는 공고가 없어요.':'등록된 마감 일정이 없어요.'}</p>}</div><button className="nh-text-button nh-schedule-all" onClick={()=>onOpen('jobs')}>관심 공고 관리<ArrowRight size={14}/></button>
  </section>;
}


