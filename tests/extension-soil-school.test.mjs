import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import vm from 'node:vm';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {formAgent,automaticPlan,allowedPage,educationFamily} from '../extension/autofill-core.js';

// Same input/dropdown ancestry and result-row classes as the supplied diagnostic.
// Names are invented; selecting a result simulates the site unlocking location.
function fixture({initial='',selected=false,timeout=700}={}){
  const w=new Window({url:'https://s-oil.recruiter.co.kr/v1/applicant/resume-form/123?step=2'}),doc=w.document;
  doc.body.innerHTML='<form><section><div><div class="ats-inline-flex ats-flex-col ats-relative ats-group"><div><div><div><input placeholder="학교명을 검색해주세요."></div></div></div></div></div><div class="ats-inline-flex ats-flex-col ats-relative ats-group"><button id="location" type="button" disabled>학교 소재지를 선택해주세요.</button></div></section><input aria-label="평점" name="collegeGroupAnswers.0.collegeGrade.score" type="number"></form>';
  w.HTMLElement.prototype.getClientRects=function(){return this.closest('[hidden]')?[]:[{}];};
  const input=doc.querySelector('input'),location=doc.querySelector('#location'),root=input.closest('.ats-inline-flex');input.value=initial;location.disabled=!selected;
  const ctx=vm.createContext({document:doc,location:w.location,URL,crypto:{randomUUID},getComputedStyle:w.getComputedStyle.bind(w),HTMLInputElement:w.HTMLInputElement,HTMLSelectElement:w.HTMLSelectElement,Event:w.Event,KeyboardEvent:w.KeyboardEvent,MutationObserver:w.MutationObserver,setTimeout:(fn,ms)=>setTimeout(fn,ms===7000?timeout:ms),clearTimeout});
  const agent=vm.runInContext('('+formAgent.toString()+')',ctx);let clicks=0;
  const list=(names,{confirm=true,parent=root,disabled=false,type='button'}={})=>{
    const dropdown=doc.createElement('div');dropdown.id='dropdown-body';
    dropdown.innerHTML='<div><div><div role="scrollbar"><div id="design-system-scroll-container"><div class="ats-mr-200"><ul class="ats-flex ats-flex-col"></ul></div></div></div></div></div>';
    for(const name of names){const li=doc.createElement('li');li.className='ats-relative ats-truncate';const b=doc.createElement('button');b.type=type;b.className='ats-truncate';b.disabled=disabled;const span=doc.createElement('span');span.textContent=name;b.append(span);li.append(b);dropdown.querySelector('ul').append(li);b.onclick=()=>{clicks++;if(confirm){input.value=name;dropdown.remove();location.disabled=false;}};}
    parent.append(dropdown);return dropdown;
  };
  const scan=()=>agent('scan'),start=(s=scan(),value='모아대학교')=>agent('search-open',{scanId:s.scanId,id:s.controls.find(c=>c.label==='학교명').id,value});
  return {w,doc,input,location,root,agent,scan,start,list,get clicks(){return clicks;}};
}

test('넓어진 학교 탐색도 중복 학교·소재지나 양식 밖 항목을 임의로 연결하지 않는다',async()=>{
  for(const kind of ['schools','locations','outside','missing']){
    const f=fixture();try{
      let wrapper=f.root;for(let i=0;i<6;i++){const div=f.doc.createElement('div');wrapper.before(div);div.append(wrapper);wrapper=div;}
      if(kind==='schools')f.location.parentElement.before(f.input.cloneNode());
      if(kind==='locations')f.location.parentElement.after(f.location.parentElement.cloneNode(true));
      if(kind==='outside')f.doc.body.append(f.location.parentElement);
      if(kind==='missing')f.location.remove();
      const school=f.scan().controls.find(c=>c.label==='학교명');
      assert.notEqual(school.type,'search',kind);assert.equal(school.unsupported,true);assert.match(school.unsupportedReason,/학교소재지/);
      assert.equal(f.clicks,0);
    }finally{await f.w.happyDOM.close();}
  }
});

test('S-OIL 학교는 하단 자동 입력에 포함되고 지연된 정확한 결과를 선택한 뒤 재인식한다',async()=>{
  const f=fixture();try{
    const s=f.scan(),school=s.controls.find(c=>c.label==='학교명');assert.equal(school.type,'search');assert.equal(school.inline,true);assert.equal(school.filled,false);
    assert.equal(automaticPlan(s.controls,[{key:'schoolName',value:'모아대학교'}]).find(c=>c.label==='학교명').status,'search');
    f.input.addEventListener('input',()=>setTimeout(()=>f.list(['모아대학교(분교)','다른대학교','모아대학교']),30),{once:true});
    assert.equal((await f.start(s)).selected,true);assert.equal(f.clicks,1);assert.equal(f.location.disabled,false);
    const next=f.scan();assert.equal(next.controls.find(c=>c.label==='학교명').filled,true);
    const gpa=next.controls.find(c=>c.label==='평점');assert.equal((await f.agent('fill',{scanId:next.scanId,entries:[{id:gpa.id,value:'3.85'}]})).results[0].ok,true);
    assert.ok(!(await f.start(next)).selected);assert.equal(f.clicks,1);
  }finally{await f.w.happyDOM.close();}
});

test('학교 이름 전체와 캠퍼스를 비교하며 동명·다른 캠퍼스·오래된 목록·외부 목록은 고르지 않는다',async()=>{
  for(const kind of ['duplicate','campus','stale','outside','disabled','submit','two-dropdowns']){
    const f=fixture();try{
      if(kind==='stale')f.list(['모아대학교']);
      else f.input.addEventListener('input',()=>{
        if(kind==='two-dropdowns'){f.list(['모아대학교']);f.list(['모아대학교']);return;}
        f.list(kind==='duplicate'?['모아대학교','모아대학교']:kind==='campus'?['모아대학교(분교)']:['모아대학교'],{parent:kind==='outside'?f.doc.body:f.root,disabled:kind==='disabled',type:kind==='submit'?'submit':'button'});
      },{once:true});
      const result=await f.start();assert.ok(result.error,kind);assert.equal(f.clicks,0,kind);assert.equal(f.location.disabled,true);
    }finally{await f.w.happyDOM.close();}
  }
});

test('입력값이나 클릭만으로 성공 처리하지 않고 사이트 반영이 없으면 중단한다',async()=>{
  for(const kind of ['no-effect','close-only']){
    const f=fixture();try{
      f.input.addEventListener('input',()=>{const list=f.list(['모아대학교'],{confirm:false});if(kind==='close-only')list.addEventListener('click',()=>list.remove());},{once:true});
      const result=await f.start();assert.ok(result.error);assert.ok(!result.selected);assert.equal(f.clicks,1);assert.equal(f.location.disabled,true);
    }finally{await f.w.happyDOM.close();}
  }
});

test('기존 학교·다른 검색어를 유지하고 검색 중 주소·입력·영역 변경과 중복 실행을 막는다',async()=>{
  for(const kind of ['existing','query','navigation','edit','replace','rescan','concurrent']){
    const f=fixture({initial:kind==='existing'?'기존대학교':kind==='query'?'이전검색':'',selected:kind==='existing'});try{
      if(!['existing','query'].includes(kind))f.input.addEventListener('input',()=>setTimeout(()=>{
        if(kind==='navigation')f.w.location.href='https://s-oil.recruiter.co.kr/v1/applicant/resume-form/123?step=3';
        if(kind==='edit')f.input.value='사용자수정';
        if(kind==='replace')f.input.replaceWith(f.input.cloneNode());
        if(kind==='rescan')f.scan();
        f.list(['모아대학교']);
      },30),{once:true});
      const s=f.scan(),running=f.start(s);
      if(kind==='concurrent')assert.match((await f.start(s)).error,/진행 중/);
      const result=await running;assert.equal(Boolean(result.selected),kind==='concurrent',kind);assert.equal(f.clicks,kind==='concurrent'?1:0,kind);
      if(kind==='existing')assert.equal(f.input.value,'기존대학교');if(kind==='query')assert.equal(f.input.value,'이전검색');
    }finally{await f.w.happyDOM.close();}
  }
});

test('동일 검색어의 열린 결과는 사용할 수 있고 실제 선택값은 진단에 노출하지 않는다',async()=>{
  const f=fixture({initial:'모아대학교'});try{
    f.list(['모아대학교']);assert.equal((await f.start()).selected,true);
    assert.ok(!JSON.stringify(f.agent('diagnose')).includes('모아대학교'));
  }finally{await f.w.happyDOM.close();}
});

test('실제 팝업 실행 코드에서 S-OIL 학교 검색·소재지·평점까지 버튼 한 번으로 이어진다',async()=>{
  const f=fixture(),w=new Window(),calls=[];
  try{
    f.input.addEventListener('input',()=>f.list(['모아대학교']),{once:true});
    f.location.onclick=()=>{const menu=f.list(['서울'],{parent:f.location.parentElement,confirm:false});menu.querySelector('button').addEventListener('click',()=>{f.location.textContent='서울';menu.remove();});};
    w.document.write(readFileSync(new URL('../extension/popup.html',import.meta.url),'utf8'));
    const sections=[{key:'educations',label:'학력',records:[{id:'one',title:'가상 학력',fields:[{key:'schoolName',label:'학교 이름',value:'모아대학교'},{key:'degree',label:'학위',value:'학사'},{key:'location',label:'소재지',value:'서울특별시'},{key:'gpa',label:'평점',value:'3.85'}]}]}];
    const chrome={runtime:{sendMessage:async m=>m.type==='autofill-status'?{ok:true,connected:true,server:'http://127.0.0.1:4318'}:{ok:true,sections}},tabs:{query:async()=>[{id:1,url:f.w.location.href}]},scripting:{executeScript:async({args})=>{calls.push(args[0]);return [{result:await f.agent(...args)}];}}};
    const source=readFileSync(new URL('../extension/popup.js',import.meta.url),'utf8').replace(/^import .*\r?\n/,'');
    vm.runInNewContext(source,{document:w.document,chrome,allowedPage,formAgent,automaticPlan,educationFamily,setTimeout,navigator:{clipboard:{writeText:async()=>{}}}});
    await new Promise(r=>setImmediate(r));await w.document.querySelector('#load').onclick();await w.document.querySelector('#scan').onclick();
    assert.match(w.document.querySelector('#fill').textContent,/2개 입력/);assert.equal(w.document.querySelectorAll('#preview select').length,0);
    await w.document.querySelector('#fill').onclick();assert.deepEqual(calls,['scan','search-open','scan','fill']);
    assert.equal(f.clicks,2);assert.equal(f.location.textContent,'서울');assert.equal(f.doc.querySelector('[aria-label="평점"]').value,'3.85');assert.match(w.document.querySelector('#result').textContent,/3개 입력 · 0개 건너뜀/);
  }finally{await f.w.happyDOM.close();await w.happyDOM.close();}
});
