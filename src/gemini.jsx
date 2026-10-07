import React,{useEffect,useRef,useState} from 'react';
import {Plug,Save,LoaderCircle} from 'lucide-react';
import {Field,Notice} from './ui.jsx';
import {essayCharacterCount} from '../lib/essay-text.mjs';

async function api(url,options={}){
  const response=await fetch(url,{...options,headers:{'Content-Type':'application/json',...options.headers}});
  const data=await response.json();
  if(!response.ok)throw Error(data.error||'요청을 처리하지 못했습니다.');
  return data;
}

export function GeminiConnection(){
  const [status,setStatus]=useState(null),[key,setKey]=useState(''),[model,setModel]=useState('gemini-3.8-flash');
  const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
  const controller=useRef(null);
  useEffect(()=>{
    const c=new AbortController();
    api('/api/ai/status',{signal:c.signal}).then(s=>{setStatus(s);setModel(s.model);}).catch(e=>{if(!c.signal.aborted)setError(e.message);});
    return()=>{c.abort();controller.current?.abort();};
  },[]);
  const perform=async test=>{
    if(busy)return;
    setBusy(true);setError('');setMessage('');const c=new AbortController();controller.current=c;
    try{
      const s=await api(test?'/api/ai/test':'/api/ai/config',{method:test?'POST':'PUT',body:JSON.stringify(test?{}:{apiKey:key,model}),signal:c.signal});
      setStatus(s);setModel(s.model);setKey('');setMessage(test?'Gemini 응답을 확인했어요. 자소서 초안 생성을 사용할 수 있습니다.':'키를 이 컴퓨터에 저장했어요. 연결 확인을 눌러 응답을 확인해 주세요.');
    }catch(e){if(!c.signal.aborted){setError(e.message);if(test)setStatus(s=>s?{...s,verified:false}:s);}}finally{if(!c.signal.aborted)setBusy(false);}
  };
  const changed=!!key.trim()||model!==status?.model;
  const environmentManaged=status?.configuration==='environment';
  return <section className="card gemini-connection"><div className="connection-head"><span className="connection-icon"><Plug size={23}/></span><span className="pill">{!status?'확인 중':status.verified?'응답 확인됨':status.configured?'키 등록됨':'키 미등록'}</span></div>
    <h2>Gemini 연결</h2><p>공고·선택한 경험·내 프롬프트로 자소서 초안을 만들고, 저장한 글의 검토 피드백을 받습니다. 공고 분석과 경험 정리의 AI 기능은 아직 연결 전입니다.</p>
    {environmentManaged?<div><Notice>온라인 사무실은 Vercel의 서버 설정에 등록된 Gemini 키를 사용합니다. 키와 모델을 변경할 때는 Vercel의 Environment Variables에서 수정한 뒤 다시 배포해 주세요.</Notice><p className="helper">사용할 모델: {status.model}</p><button type="button" className="button" disabled={busy||!status.configured} onClick={()=>perform(true)}>{busy?<LoaderCircle className="spin" size={15}/>:<Plug size={15}/>}연결 확인</button></div>:<form onSubmit={e=>{e.preventDefault();perform(false);}}>
      <Field label="Gemini API 키" hint="이 컴퓨터의 서버 설정 파일에 저장하며, 자료 백업에는 포함하지 않습니다. 저장한 키는 다시 표시하지 않습니다.">
        <input type="password" autoComplete="new-password" spellCheck={false} value={key} onChange={e=>setKey(e.target.value)} placeholder={status?.configured?'키 등록됨 · 변경할 때만 입력':'Google AI Studio에서 복사한 키'} disabled={busy||!status}/>
      </Field>
      <Field label="사용할 모델"><input value={model} onChange={e=>setModel(e.target.value)} disabled={busy||!status} spellCheck={false}/></Field>
      <div className="connection-actions"><button className="button primary" disabled={busy||!status||(!key.trim()&&!status?.configured)}><Save size={15}/>키·모델 저장</button><button type="button" className="button" disabled={busy||!status?.configured||changed} onClick={()=>perform(true)}>{busy?<LoaderCircle className="spin" size={15}/>:<Plug size={15}/>}연결 확인</button></div>
    </form>}
    <p className="helper">연결 확인은 개인 자료 대신 ‘OK’라는 짧은 문장만 Google에 보냅니다. 모델·계정 설정에 따라 API 사용 요금이 발생할 수 있습니다.{!environmentManaged&&' 키 저장 자체는 외부로 전송하지 않습니다.'}</p>
    <a className="text-button" href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer">Google AI Studio에서 API 키 확인하기 ↗</a>
    {message&&<p role="status">{message}</p>}{error&&<p role="alert" className="gemini-error">{error}</p>}
  </section>;
}

export function GeminiDraft({requestText,onApply,limit,includeSpaces}){
  const [status,setStatus]=useState(null),[pending,setPending]=useState(false),[saving,setSaving]=useState(false);
  const [result,setResult]=useState(null),[error,setError]=useState('');const request=useRef(null);
  useEffect(()=>{const c=new AbortController();api('/api/ai/status',{signal:c.signal}).then(setStatus).catch(e=>{if(!c.signal.aborted)setError(e.message);});return()=>{c.abort();request.current?.abort();};},[]);
  const generate=async()=>{
    if(pending)return;const c=new AbortController();request.current=c;setPending(true);setError('');
    try{setResult(await api('/api/ai/draft',{method:'POST',body:JSON.stringify({requestText,consent:true}),signal:c.signal}));}
    catch(e){if(!c.signal.aborted)setError(e.message);}finally{if(!c.signal.aborted)setPending(false);}
  };
  const count=result?essayCharacterCount(result.text,includeSpaces):0;
  return <section className="gemini-draft">
    <Notice>아래 버튼을 누르면 위 요청문 전체(내 프롬프트·공고·문항·선택한 경험·구성)를 Google Gemini에 전송합니다. 기본 정보 보관함이나 선택하지 않은 경험은 보내지 않습니다. API 사용 요금이 발생할 수 있습니다.</Notice>
    {!status?.configured&&<p className="helper">설정 → 연결 상태에서 Gemini 키를 등록해 주세요.</p>}
    <div className="connection-actions"><button className="button primary" disabled={!status?.configured||pending||saving} onClick={generate}>{pending&&<LoaderCircle size={15} className="spin"/>}{pending?'초안 생성 중…':result?'Gemini에 전송하고 다시 생성':'Gemini에 전송하고 초안 생성'}</button>{pending&&<button className="button" onClick={()=>{request.current?.abort();setPending(false);setError('요청을 취소했어요. 기존 글은 그대로입니다. 이미 처리된 요청의 요금은 취소되지 않을 수 있습니다.');}}>생성 취소</button>}</div>
    {error&&<p role="alert" className="gemini-error">{error}</p>}
    {result&&<div className="gemini-result"><h3>생성한 초안 · 아직 적용 전</h3><p className={`helper ${count>limit?'essay-count-over':''}`}>{result.model} · {count.toLocaleString()} / {limit.toLocaleString()}자{count>limit?` · ${(count-limit).toLocaleString()}자 초과 · 저장 후에도 줄일 수 있어요.`:''}</p><textarea readOnly rows={12} aria-label="Gemini가 작성한 초안" value={result.text}/><p className="helper">사실과 표현을 확인해 주세요. 적용하면 기존에 쓰던 글도 이전 버전으로 보관합니다.</p><button className="button primary" disabled={pending||saving} onClick={async()=>{setSaving(true);try{await onApply(result);}catch{setError('초안을 저장하지 못했습니다. 본문을 복사해 보관해 주세요.');}finally{setSaving(false);}}}>이 초안을 새 버전으로 저장하고 적용</button></div>}
  </section>;
}
