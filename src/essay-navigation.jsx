import React from 'react';
import {Building2,Files,FileText,Search,ChevronRight,ArrowLeft} from 'lucide-react';
import {Empty} from './ui.jsx';
import {essayCharacterCount} from '../lib/essay-text.mjs';

export function companyGroups(data) {
  const groups=new Map();
  for(const job of data.jobs){
    const essays=data.essays.filter(e=>e.jobId===job.id);
    if(!essays.length)continue;
    const group=groups.get(job.company)||{company:job.company,essays:[],jobs:[]};
    group.jobs.push(job);group.essays.push(...essays);groups.set(job.company,group);
  }
  return [...groups.values()].map(group=>({...group,updatedAt:group.essays.reduce((latest,essay)=>essay.updatedAt>latest?essay.updatedAt:latest,'')}));
}

export function EssayDirectory({groups,company,essayId,onCompany,onEssay,query,onQuery}) {
  return <nav className="essay-directory" aria-label="기업별 자기소개서">
    <div className="essay-directory-title"><Files size={18}/><strong>자기소개서 보관함</strong></div>
    <label className="essay-search"><Search size={16}/><input aria-label="자소서 검색" placeholder="기업, 직무, 문항 검색" value={query} onChange={e=>onQuery(e.target.value)}/></label>
    <button className={`essay-company ${company===null?'active':''}`} aria-current={company===null?'page':undefined} onClick={()=>onCompany(null)}><Files size={16}/><span>전체 기업</span><small>{groups.length}</small></button>
    <p className="essay-nav-label">기업별 모아보기</p>
    {groups.map(group=><div key={group.company}>
      <button className={`essay-company ${company===group.company?'active':''}`} aria-current={company===group.company?'page':undefined} onClick={()=>onCompany(group.company)}><Building2 size={16}/><span>{group.company}</span><small>{group.essays.length}</small></button>
      {company===group.company&&<div className="essay-nav-questions">{group.essays.map((essay,index)=><button key={essay.id} className={essayId===essay.id?'active':''} aria-current={essayId===essay.id?'page':undefined} onClick={()=>onEssay(essay.id)} title={essay.question}><span>{String(index+1).padStart(2,'0')}</span><span>{essay.question}</span></button>)}</div>}
    </div>)}
    {!groups.length&&<p className="essay-nav-empty">새 자소서를 만들면<br/>기업별로 정리됩니다.</p>}
  </nav>;
}

export function EssayShelf({groups,company,query,onCompany,onSelect,onReset,onCreate,canCreate}) {
  const normalized=query.trim().toLocaleLowerCase();
  const companyView=company===null&&!normalized;
  const visible=groups.filter(g=>company===null||g.company===company).map(g=>({...g,essays:g.essays.filter(e=>`${g.company} ${g.jobs.find(j=>j.id===e.jobId)?.role} ${e.question}`.toLocaleLowerCase().includes(normalized))})).filter(g=>g.essays.length);
  return <div className="essay-shelf compact-essay-shelf">
    {company!==null&&<button className="text-button compact-back" onClick={()=>onCompany(null)}><ArrowLeft size={15}/> 기업 목록으로</button>}
    <div className="compact-list-summary"><span>{companyView?`기업 ${visible.length}개 · 문항 ${visible.reduce((n,g)=>n+g.essays.length,0)}개`:`${normalized?'검색 결과':'저장한 문항'} ${visible.reduce((n,g)=>n+g.essays.length,0)}개`}</span><span>{companyView?'기업을 선택해 문항 보기':'문항 추가 순'}</span></div>
    {companyView?<ul className="compact-company-list" aria-label="자소서를 보관한 기업 목록">{visible.map(group=>{
      const written=group.essays.filter(e=>e.draft.trim()).length;
      return <li key={group.company}><button className="compact-company-row" aria-label={`${group.company} 문항 보기`} onClick={()=>onCompany(group.company)}>
        <span className="compact-company-icon"><Building2 size={20} aria-hidden="true"/></span>
        <span className="compact-record-main"><strong>{group.company}</strong><span className="compact-record-meta">{[...new Set(group.jobs.map(j=>j.role))].join(' · ')}</span></span>
        <span className="compact-company-progress"><span>본문 있음 <b>{written} / {group.essays.length}</b>문항</span><small>{new Date(group.updatedAt).toLocaleDateString('ko-KR')} 수정</small></span><ChevronRight size={17} aria-hidden="true"/>
      </button></li>;
    })}</ul>:visible.map(group=><section className="compact-question-group" key={group.company} aria-label={`${group.company} 문항 목록`}>
      {normalized&&<header><Building2 size={17}/><h2>{group.company}</h2><span>{group.essays.length}문항</span></header>}
      <ul>{group.essays.map((essay,index)=>{const job=group.jobs.find(j=>j.id===essay.jobId);const count=essayCharacterCount(essay.draft,essay.includeSpaces);const questionNumber=groups.find(item=>item.company===group.company).essays.filter(item=>item.jobId===essay.jobId).findIndex(item=>item.id===essay.id)+1;return <li key={essay.id}><button className="compact-question-row" aria-label={`${group.company} · ${job?.role} · ${essay.question}`} onClick={()=>onSelect(essay.id)}>
        <span className="compact-question-number">{String(questionNumber).padStart(2,'0')}</span>
        <span className="compact-record-main"><strong>{essay.question}</strong><span className="compact-record-meta">{job?.role}<span className={count>essay.limit?'essay-count-over':''}> · {count.toLocaleString()} / {essay.limit.toLocaleString()}자 · 공백 {essay.includeSpaces?'포함':'제외'}{count>essay.limit&&` · ${(count-essay.limit).toLocaleString()}자 초과`}</span><span> · {new Date(essay.updatedAt).toLocaleDateString('ko-KR')} 수정</span></span></span>
        <span className={`compact-record-status ${essay.draft.trim()?'writing':'pending'}`}>{essay.draft.trim()?'작성 중':'작성 전'}</span><ChevronRight className="compact-record-arrow" size={17} aria-hidden="true"/>
      </button></li>;})}</ul>
    </section>)}
    {!visible.length&&<Empty icon={FileText} title={query?'검색한 문항이 없어요':'아직 작성한 자기소개서가 없어요'} action={<button className="button primary" onClick={query?onReset:onCreate}>{query?'검색 초기화':canCreate?'문항 추가하기':'공고 등록하기'}</button>}>{query?'기업명, 직무 또는 문항의 다른 단어로 찾아보세요.':'공고를 선택하고 문항을 등록하면 이곳에서 이어 쓸 수 있습니다.'}</Empty>}
  </div>;
}
