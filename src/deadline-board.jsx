import React,{useEffect,useState} from 'react';
import {CalendarDays} from 'lucide-react';
import {dateToday} from './ui.jsx';
import {deadlineNotices} from '../lib/deadline-notices.mjs';

export function DeadlineBoard({data,onOpen}){
  const [today,setToday]=useState(dateToday);
  useEffect(()=>{
    const update=()=>setToday(dateToday());
    const timer=setInterval(update,60000);
    document.addEventListener('visibilitychange',update);
    return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',update);};
  },[]);
  const notices=deadlineNotices(data,today),urgent=notices.filter(n=>n.urgent).length;
  return <aside className="room-memo deadline-board" aria-label="지원 일정 알림">
    <span className="memo-pin"/>
    <div className="deadline-heading"><CalendarDays size={14}/><strong>지원 일정</strong>{urgent>0&&<span className="deadline-attention">작성 확인 {urgent}</span>}</div>
    {notices.length?<ul className="deadline-list" aria-label="다가오는 지원 일정">{notices.map(({job,days,urgent,status})=><li key={job.id}>
      <button className={`deadline-item ${urgent?'needs-writing':''}`} onClick={()=>onOpen('jobs',job.id)} aria-label={`${job.company} ${job.role}, ${days===0?'오늘 마감':`마감 ${days}일 전`}, ${status}, 공고 열기`}>
        <span className="deadline-date"><b>{days===0?'D-DAY':`D-${days}`}</b></span>
        <span className="deadline-detail" title={`${job.company} · ${job.role} · ${job.deadline} 마감 · ${status}`}><strong>{job.company}</strong><span> · {job.role}</span></span>
        {urgent&&<em className="deadline-unwritten">미작성</em>}
      </button>
    </li>)}</ul>:<p className="deadline-empty">예정된 마감 일정이 없어요.<br/>공고에 마감일을 등록해 주세요.</p>}
  </aside>;
}
