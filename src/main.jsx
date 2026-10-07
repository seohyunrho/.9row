import React, {useEffect,useState,useRef} from 'react';
import {createRoot} from 'react-dom/client';
import {Check,Info,LoaderCircle,X} from 'lucide-react';
import {ExperiencesPage,NewExperiencePage,EssaysPage,ReviewPage,ApplicationsPage,DirectionPage,SettingsPage} from './pages.jsx';
import {OfficeContext} from './ui.jsx';
import {CalShell as OfficeShell} from './cal-home.jsx';
import {CalJobsPage as JobsPage} from './cal-jobs.jsx';
import './styles.css';
import './workspace.css';
import './office.css';
import './pixel-popups.css';
import './colleague-reactions.css';
import './calm-workspace.css';
import './interactive-desks.css';
function App() {
  const [workspace,setWorkspace]=useState(()=>localStorage.getItem('moa-workspace') || 'demo');
  const [data,setData]=useState(null);const [revision,setRevision]=useState(0);const [busy,setBusy]=useState(false);
  const [runtime,setRuntime]=useState(null);
  const [saveFeedback,setSaveFeedback]=useState(null);
  const [handoff,setHandoff]=useState(null);
  const [page,setPage]=useState(()=>location.hash.slice(1).split('/')[0] || 'home');
  const pageRef=useRef(page);
  const [selectedEssayId,setSelectedEssayId]=useState(null);const [selectedJob,setSelectedJob]=useState(null);const [toast,setToast]=useState('');const [error,setError]=useState('');const [menu,setMenu]=useState(false);
  const lock=useRef(false);const timer=useRef(null);const dirtyRef=useRef(false);const setDirty=value=>{dirtyRef.current=value;};
  const notify=message=>{setToast(message);clearTimeout(timer.current);timer.current=setTimeout(()=>setToast(''),4000);};
  const navigate=(next,jobId,essayId)=>{
    if(dirtyRef.current&&!confirm('저장하지 않은 변경사항이 있어요. 이동할까요?'))return false;
    setHandoff(null);
    dirtyRef.current=false;pageRef.current=next;setPage(next);
    setSelectedJob(jobId||null);setSelectedEssayId(essayId||null);
    location.hash=next;setMenu(false);window.scrollTo({top:0});return true;
  };
  useEffect(()=>{const f=()=>{const next=location.hash.slice(1).split('/')[0] || 'home';if(next===pageRef.current)return;if(dirtyRef.current&&!confirm('저장하지 않은 변경사항이 있어요. 이동할까요?')){history.replaceState(null,'',`#${pageRef.current}`);return;}dirtyRef.current=false;pageRef.current=next;setHandoff(null);setSelectedJob(null);setSelectedEssayId(null);setPage(next);};window.addEventListener('hashchange',f);return()=>window.removeEventListener('hashchange',f);},[]);
  useEffect(()=>{let cancelled=false;setData(null);setError('');fetch(`/api/state?workspace=${workspace}`).then(async r=>{const b=await r.json();if(!r.ok)throw Error(b.error);return b;}).then(b=>{if(!cancelled){setData(b.data);setRevision(b.revision);}}).catch(e=>{if(!cancelled)setError(e.message);});return()=>{cancelled=true;};},[workspace]);
  const switchWorkspace=mode=>{if(lock.current)return;if(dirtyRef.current&&!confirm('저장하지 않은 내용이 있어요. 다른 사무실로 이동할까요?'))return;dirtyRef.current=false;localStorage.setItem('moa-workspace',mode);setWorkspace(mode);setSelectedJob(null);navigate('home');};
  const commit=async (updater,message='저장했어요')=>{
    if(lock.current)return false;const savingPage=pageRef.current;lock.current=true;setBusy(true);setError('');setSaveFeedback(null);
    try {const next=structuredClone(data);updater(next);const r=await fetch(`/api/state?workspace=${workspace}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision,data:next})});const b=await r.json();if(!r.ok)throw Error(b.error);setData(b.data);setRevision(b.revision);setSaveFeedback({id:crypto.randomUUID(),status:'success',workspace,page:savingPage});if(message)notify(message);return true;}catch(e){setError(e.message);setSaveFeedback({id:crypto.randomUUID(),status:'error',workspace,page:savingPage});return false;}finally{setBusy(false);lock.current=false;}
  };
  useEffect(()=>{const c=new AbortController();fetch('/api/config',{signal:c.signal}).then(async r=>{if(!r.ok)throw Error();return r.json();}).then(setRuntime).catch(()=>{});return()=>c.abort();},[]);
  const context={data,workspace,commit,busy,navigate,selectedJob,setSelectedJob,selectedEssayId,setSelectedEssayId,notify,switchWorkspace,setDirty,toast,saveFeedback,handoff,setHandoff,runtime};
  const summaryRef=useRef(null);summaryRef.current={workspace,page,experiences:data?.experiences.length||0,jobs:data?.jobs.length||0,essays:data?.essays.length||0,applications:data?.applications.length||0};
  useEffect(()=>{const registry=document.modelContext;if(!registry?.registerTool)return;const lifecycle=new AbortController();try{Promise.resolve(registry.registerTool({name:'read_office_summary',title:'모아 사무실 현황 확인',description:'현재 화면과 같은 사무실의 기록 개수와 AI 연결 상태를 읽습니다. 개인 자료 본문은 반환하지 않습니다.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:false},async execute(input){if(input&&Object.keys(input).length)throw Error('입력값이 필요 없는 조회입니다.');const response=await fetch('/api/config');if(!response.ok)throw Error('연결 상태를 읽지 못했습니다.');const config=await response.json();return {...summaryRef.current,aiConnected:config.aiConnected,aiConfigured:config.aiConfigured};}},{signal:lifecycle.signal})).catch(()=>{});}catch{}return()=>lifecycle.abort();},[]);
  const pages={review:ReviewPage,'experience-new':NewExperiencePage,experiences:ExperiencesPage,jobs:JobsPage,essays:EssaysPage,applications:ApplicationsPage,direction:DirectionPage,settings:SettingsPage};const Page=pages[page];
  return <OfficeContext.Provider value={context}><div className={`app office-app cal-app ${data?.preferences.reducedMotion?'reduce-motion':''}`}>
    {data?<OfficeShell key={workspace} page={Page?page:'home'}>
      {error&&<div className="error-banner" role="alert"><Info size={18}/><span>{error}</span><button onClick={()=>setError('')} aria-label="오류 안내 닫기"><X size={17}/></button></div>}
      {Page&&<Page key={workspace+page}/>}
    </OfficeShell>:<div className="loading"><LoaderCircle className="spin"/><p>{error||'취업 준비 공간을 불러오고 있어요…'}</p></div>}
    {toast&&page==='home'&&<div role="status" className="toast"><Check size={17}/>{toast}</div>}
  </div></OfficeContext.Provider>;
}

createRoot(document.getElementById('root')).render(<App/>);

import './pixel-desk-motion.css';

import './gemini.css';

import './workflow.css';

import './messenger.css';
import './full-workspace.css';
import './memo-board.css';
import './essay-studio.css';
import './document-workspace.css';
import './compact-libraries.css';
import './desk-focus.css';

import './cal-home.css';
import './cal-jobs.css';
import './notion-cal-home.css';
import './blue-workspace.css';
import './initial-profile-design.css';
