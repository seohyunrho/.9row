import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import vm from 'node:vm';
import {randomUUID} from 'node:crypto';
import {formAgent,automaticPlan} from '../extension/autofill-core.js';

// Trigger ancestry is observed. Menu shape reuses the observed ATS school list;
// actual location-menu compatibility still needs the user's browser verification.
function fixture({disabled=false,selected=false,mode='normal',names=['경기','서울','부산'],value='서울특별시'}={}){
  const w=new Window({url:'https://s-oil.recruiter.co.kr/v1/applicant/resume-form/123?step=2'}),doc=w.document;
  doc.body.innerHTML='<form><div class="ats-inline-flex ats-flex-col ats-relative ats-group"><button type="button"><p>학교 소재지를 선택해주세요.</p></button></div><input aria-label="평점" type="number" step="any"></form>';
  w.HTMLElement.prototype.getClientRects=function(){return this.closest('[hidden]')?[]:[{}];};
  const e=doc.querySelector('button'),root=e.parentElement;let opened=0,clicked=0;
  e.disabled=disabled;if(selected)e.textContent='부산';
  const ctx=vm.createContext({document:doc,location:w.location,URL,crypto:{randomUUID},getComputedStyle:w.getComputedStyle.bind(w),HTMLInputElement:w.HTMLInputElement,HTMLSelectElement:w.HTMLSelectElement,Event:w.Event,MutationObserver:w.MutationObserver,setTimeout:(fn,ms)=>setTimeout(fn,ms===5000?500:ms),clearTimeout});
  const agent=vm.runInContext('('+formAgent.toString()+')',ctx),scan=agent('scan');
  e.onclick=()=>{opened++;setTimeout(()=>{
    if(mode==='navigate')w.location.href='https://s-oil.recruiter.co.kr/v1/applicant/resume-form/123?step=3';
    if(mode==='user-select')e.textContent='부산';
    if(mode==='replace')e.replaceWith(e.cloneNode(true));
    const dropdown=doc.createElement('div');dropdown.id='dropdown-body';
    dropdown.innerHTML=mode==='unknown'?'<ul></ul>':'<div id="design-system-scroll-container"><div class="ats-mr-200"><ul></ul></div></div>';
    for(const name of names){const li=doc.createElement('li'),button=doc.createElement('button');button.type=mode==='submit'?'submit':'button';button.textContent=name;button.disabled=mode==='disabled-result';li.append(button);dropdown.querySelector('ul').append(li);button.onclick=()=>{clicked++;if(!['no-effect','close-only'].includes(mode))e.textContent=name;if(mode!=='no-effect')dropdown.remove();};}
    (mode==='outside'?doc.body:root).append(dropdown);
  },20);};
  const plan=automaticPlan(scan.controls,[{key:'location',label:'소재지',value},{key:'gpa',label:'평점',value:'3.85'}]);
  const fill=()=>agent('fill',{scanId:scan.scanId,entries:plan.filter(c=>c.status==='ready').map(c=>({id:c.id,value:c.value}))});
  return {w,doc,e,root,agent,scan,plan,fill,get opened(){return opened;},get clicked(){return clicked;}};
}

test('활성화된 학교 소재지를 자동 연결하고 지역 약칭의 선택 반영까지 확인한다',async()=>{
  for(const [value,names] of [['서울특별시',['경기','서울']],['경기도',['경기']],['충북',['충청북도']],['전라북도',['전북특별자치도']]]){
    const f=fixture({value,names});try{
      assert.equal(f.plan.find(c=>c.label==='학교소재지').status,'ready');
      const result=await f.fill();assert.ok(result.results.every(r=>r.ok),JSON.stringify(result));assert.equal(f.clicked,1);assert.equal(f.opened,1);assert.equal(f.doc.querySelector('input').value,'3.85');
      assert.ok(!f.agent('scan').controls.some(c=>c.label==='학교소재지'&&!c.filled&&!c.unsupported));
    }finally{await f.w.happyDOM.close();}
  }
});

test('선택된 지역·학교 선택 전 비활성 칸·도중 선택 변경을 덮어쓰지 않는다',async()=>{
  for(const options of [{selected:true},{disabled:true},{mode:'user-select'},{mode:'replace'},{mode:'navigate'}]){
    const f=fixture(options);try{
      const result=await f.fill();assert.equal(f.clicked,0);
      if(options.mode)assert.ok(result.results.some(r=>r.label==='학교소재지'&&!r.ok));
      else assert.equal(f.opened,0);
      if(options.selected||options.mode==='user-select')assert.equal(f.e.textContent,'부산');
    }finally{await f.w.happyDOM.close();}
  }
});

test('동명 지역·불명확한 주소·다른 구조·외부 목록·비활성·제출 버튼은 선택하지 않는다',async()=>{
  for(const options of [{names:['서울','서울특별시']},{value:'서울 강남구'},{value:'광주시',names:['광주광역시']},{mode:'unknown'},{mode:'outside'},{mode:'disabled-result'},{mode:'submit'}]){
    const f=fixture(options);try{
      const result=await f.fill();assert.equal(f.clicked,0,JSON.stringify(options));assert.equal(result.results.find(r=>r.label==='학교소재지').ok,false);
    }finally{await f.w.happyDOM.close();}
  }
});

test('지역 클릭만 됐거나 목록만 닫혔을 때 성공으로 알리지 않고 중복 실행을 막는다',async()=>{
  for(const mode of ['no-effect','close-only','normal']){
    const f=fixture({mode});try{
      const running=f.fill();assert.match((await f.fill()).error,/진행 중/);
      const result=await running;assert.equal(f.clicked,1);assert.equal(result.results.find(r=>r.label==='학교소재지').ok,mode==='normal');
    }finally{await f.w.happyDOM.close();}
  }
});
