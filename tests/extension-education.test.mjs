import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import vm from 'node:vm';
import {randomUUID} from 'node:crypto';
import {formAgent,suggestMappings,automaticPlan,educationFamily} from '../extension/autofill-core.js';

function fixture(html){
  const w=new Window({url:'https://hshyosung.recruiter.co.kr/mrs2/applicant/resume/writeResume'});
  w.document.body.innerHTML=html;
  w.HTMLElement.prototype.getClientRects=function(){return this.closest('[hidden]')?[]:[{}];};
  const ctx=vm.createContext({document:w.document,location:w.location,URL,crypto:{randomUUID},getComputedStyle:w.getComputedStyle.bind(w),HTMLInputElement:w.HTMLInputElement,HTMLSelectElement:w.HTMLSelectElement,Event:w.Event,KeyboardEvent:w.KeyboardEvent,MutationObserver:w.MutationObserver,setTimeout,clearTimeout});
  const agent=vm.runInContext('('+formAgent.toString()+')',ctx);
  return {w,doc:w.document,agent,ctx,scan:()=>agent('scan')};
}
const radio=(id,text,name)=>`<label><input type="radio" id="${id}" name="${name}">${text}</label>`;
test('진단된 HS효성 필드 이름으로 학력 구역과 평점·만점을 구별한다',()=>{
  const f=fixture(`<input title="평점" name="highschool.score" type="number" disabled>
    <div>${radio('college-ba','학사','college[0].degreeTypeCode')}${radio('college-aa','전문학사','college[0].degreeTypeCode')}</div>
    <input title="평점" name="college[0].score" type="number" step="any"><select title="평점" name="college[0].perfectScore" disabled><option value="">선택</option><option>4.5</option></select>
    <input name="college[0].academyCode" title="학교 코드">
    <div>${radio('grad-master','석사','graduateSchool[0].degreeTypeCode')}${radio('grad-doctor','박사','graduateSchool[0].degreeTypeCode')}</div>`);
  const fields=[{key:'degree',label:'학위',value:'학사'},{key:'gpa',label:'평점',value:'3.85'},{key:'gpaScale',label:'만점 기준',value:'4.5'}];
  assert.equal(educationFamily(fields),'college');
  const s=f.agent('scan',{education:true,family:educationFamily(fields)});assert.equal(s.scope,'college[0]');assert.equal(s.controls.length,3);
  const p=automaticPlan(s.controls,fields);assert.equal(p.filter(c=>c.status==='ready').length,2);assert.equal(p.find(c=>c.label==='만점 기준').status,'pending');
  const r=f.agent('fill',{scanId:s.scanId,entries:p.filter(c=>c.status==='ready').map(c=>({id:c.id,value:c.value}))});assert.ok(r.results.every(c=>c.ok));assert.ok(f.doc.querySelector('#college-ba').checked);assert.ok(!f.doc.querySelector('#grad-master').checked);
  assert.ok(f.agent('scan',{education:true,family:''}).error);
  f.doc.body.insertAdjacentHTML('beforeend','<input name="college[1].score" type="number">');assert.ok(f.agent('scan',{education:true,family:'college'}).error);
});
test('HS효성 전공은 코드 대신 검색어만 채우고 결과 선택은 아직 하지 않는다',()=>{
  const f=fixture('<div class="middle-set"><div class="search"><label>전공검색<input type="search" class="text"></label></div><input class="hidden" name="college[0].major[0].majorCode" title="전공 코드"></div>');
  const s=f.agent('scan',{education:true,family:'college'});assert.equal(s.controls.length,1);const c=s.controls[0];assert.ok(c.inline);
  const r=f.agent('search-open',{scanId:s.scanId,id:c.id,value:'모아대학교'});assert.ok(r.inline);assert.equal(f.doc.querySelector('input[type=search]').value,'모아대학교');assert.equal(f.doc.querySelector('input[name]').value,'');
  assert.ok(f.agent('search-open',{scanId:s.scanId,id:c.id,value:'다른학교'}).error);
});
test('검색 결과 구조를 입력값 없이 기억하고 목록이 닫혀도 유지한다',async()=>{
  const f=fixture('<div class="search"><label>학교검색<input type="search" value="PRIVATE_QUERY"></label><ul hidden></ul></div>');
  try{
    assert.equal(f.agent('watch-search').watching,1);const ul=f.doc.querySelector('ul');ul.hidden=false;ul.innerHTML='<li role="option" class="result-row">PRIVATE_SCHOOL<button type="button">PRIVATE_SELECT</button></li>';
    await new Promise(resolve=>setTimeout(resolve,170));let d=f.agent('diagnose');assert.ok(d.recordedSearchStructures[0].nodes.some(n=>n.role==='option'));assert.ok(!JSON.stringify(d).includes('PRIVATE_'));
    ul.hidden=true;ul.replaceChildren();await new Promise(resolve=>setTimeout(resolve,170));d=f.agent('diagnose');assert.ok(d.recordedSearchStructures[0].nodes.some(n=>n.role==='option'));assert.ok(!JSON.stringify(d).includes('PRIVATE_'));
  }finally{vm.runInContext('globalThis.__moaSearchWatch?.stop()',f.ctx);await f.w.happyDOM.close();}
});
test('학교 코드와 전공 내부 식별자는 스캔·자동 연결에서 제외한다',()=>{
  const f=fixture('<input title="학교 코드"><input title="학교명" name="schoolCode"><input title="전공" id="majorCd"><input title="평점" id="grade">');
  const s=f.scan();assert.equal(s.controls.length,1);assert.equal(s.controls[0].label,'평점');
  assert.equal(suggestMappings([{label:'학교 코드'}],[{key:'schoolName',label:'학교 코드',value:'가상대'}])[0],'');
  assert.equal(automaticPlan([{label:'학교 코드'}],[]).length,0);
  f.doc.querySelector('#grade').name='schoolCd';
  assert.equal(f.agent('fill',{scanId:s.scanId,entries:[{id:s.controls[0].id,value:'가상대'}]}).results[0].ok,false);
});
test('검색 제목이 다르고 결과가 숨겨진 인접 영역에 있어도 구조만 수집한다',()=>{
  const f=fixture('<div class="middle-set"><div class="search"><input type="search" title="학교를 찾아 주세요" value="PRIVATE_QUERY"></div><input name="college[0].academyCode" value="PRIVATE_CODE"><ul hidden class="suggestions"><li class="item">PRIVATE_NAME<button type="button">PRIVATE_ACTION</button></li></ul></div>');
  const d=f.agent('diagnose');assert.equal(d.version,3);assert.equal(d.watchStatus.inputs,1);assert.equal(d.searchStructures.length,1);assert.ok(d.searchStructures[0].nodes.some(n=>n.classes.includes('suggestions')&&!n.visible));assert.ok(!JSON.stringify(d).includes('PRIVATE_'));assert.ok(d.captureId);assert.notEqual(d.captureId,f.agent('diagnose').captureId);
});
test('빠르게 닫히는 검색 결과와 검색 입력 감지 횟수를 기록한다',async()=>{
  const f=fixture('<div class="search"><label>학교검색<input type="search"></label><ul></ul></div>');
  try{
    f.agent('watch-search');f.doc.querySelector('input').dispatchEvent(new f.w.Event('input',{bubbles:true}));
    const ul=f.doc.querySelector('ul');ul.innerHTML='<li role="option">PRIVATE_RESULT</li>';
    await new Promise(resolve=>setTimeout(resolve,10));ul.replaceChildren();await new Promise(resolve=>setTimeout(resolve,10));
    const d=f.agent('diagnose');assert.equal(d.watchStatus.inputEvents,1);assert.ok(d.watchStatus.captures>=2);assert.ok(d.recordedSearchStructures[0].nodes.some(n=>n.role==='option'));assert.ok(!JSON.stringify(d).includes('PRIVATE_'));
  }finally{vm.runInContext('globalThis.__moaSearchWatch?.stop()',f.ctx);await f.w.happyDOM.close();}
});
test('자동 입력 계획은 확실한 값만 연결하고 미지원·중복·불완전 날짜를 구별한다',()=>{
  const fields=[{key:'gpa',label:'전체 평점',value:'3.85'},{key:'startMonth',label:'입학 연월',value:'2020-03'},{key:'location',label:'소재지',value:'서울'}];
  const plan=automaticPlan([{label:'평점',id:'gpa',type:'number'},{label:'입학일',type:'date'},{label:'학교소재지',unsupported:true},{label:'전공',filled:true},{label:'학교 코드'},{label:'학교명',type:'search'},{label:'기타'}],fields);
  assert.equal(plan.filter(c=>c.status==='ready').length,1);assert.equal(plan[0].value,'3.85');assert.equal(plan[1].status,'pending');assert.match(plan[2].reason,/연결/);assert.equal(plan[3].status,'kept');assert.equal(plan[4].status,'search');
  assert.ok(automaticPlan([{label:'평점'},{label:'학점'}],fields).every(c=>c.status==='pending'));
});
test('구조 진단은 입력값·자소서·인증값·주소 파라미터를 반환하지 않는다',()=>{
  const f=fixture('<div class="education-row"><input id="schoolCode" title="학교코드" value="PRIVATE_CODE"><input title="입학일" readonly value="PRIVATE_DATE"><input type="password" value="PRIVATE_SECRET"><input title="이메일" value="PRIVATE_EMAIL"><textarea>PRIVATE_ESSAY</textarea><input type="hidden" title="학교명" value="PRIVATE_HIDDEN"><button type="button" class="school-search">학교검색</button></div>');
  f.w.location.href+='?token=PRIVATE_TOKEN';const r=f.agent('diagnose');const text=JSON.stringify(r);
  assert.ok(!text.includes('PRIVATE_'));assert.ok(!text.includes('value'));assert.equal(r.fields.length,3);assert.ok(r.fields.some(f=>f.readOnly));assert.equal(r.fields[0].id,'schoolCode');assert.equal(r.host,'hshyosung.recruiter.co.kr');
});
test('학적 항목의 분리된 제목·title와 radio 그룹을 인식한다',()=>{
  const f=fixture(`<div><span>학교소재지</span><div><select id="loc"><option value="">선택</option><option>서울</option></select></div></div>
    <div><span>* 학위구분</span><div>${radio('aa','전문학사','degree')}${radio('ba','학사','degree')}</div></div>
    <div><span>입학구분</span><div>${radio('new','입학','admit')}${radio('transfer','편입','admit')}</div></div>
    <div><span>졸업구분</span><div>${radio('grad','졸업','grad')}${radio('expected','졸업예정','grad')}</div></div>
    <div><span>평점</span><div><input id="gpa" type="number" step="any" max="4.5"></div></div><select id="scale" title="만점기준"><option value="">선택</option><option>4.5</option></select>
    <input aria-label="입학일" id="start"><textarea>PRIVATE_ESSAY</textarea><input type="password" title="password">`);
  const s=f.scan();assert.equal(s.controls.length,7);assert.ok(!JSON.stringify(s).includes('PRIVATE_ESSAY'));
  const fields=[['degree','학위','학사'],['admissionType','입학 구분','신입학'],['status','재학 상태','졸업 예정'],['gpa','전체 평점','3.85'],['gpaScale','만점 기준','4.5'],['location','소재지','서울'],['startMonth','입학 연월','2020-03']].map(([key,label,value])=>({key,label,value}));
  const keys=suggestMappings(s.controls,fields);assert.equal(keys.filter(Boolean).length,7);
  const entries=s.controls.map((c,i)=>({id:c.id,value:fields.find(f=>f.key===keys[i]).value}));
  const result=f.agent('fill',{scanId:s.scanId,entries});assert.equal(result.results.filter(r=>r.ok).length,6,JSON.stringify(result.results));
  assert.equal(f.doc.querySelector('#gpa').value,'3.85');assert.ok(f.doc.querySelector('#ba').checked);assert.ok(f.doc.querySelector('#new').checked);assert.ok(f.doc.querySelector('#expected').checked);assert.equal(f.doc.querySelector('#start').value,'');
  assert.match(result.results.find(r=>r.label==='입학일').reason,/연월/);
  assert.ok(f.agent('fill',{scanId:s.scanId,entries}).results.every(r=>!r.ok));
});
test('기존 선택과 미리보기 후 바뀐 radio 그룹을 유지한다',()=>{
  const f=fixture(`<fieldset><legend>학위구분</legend>${radio('a','전문학사','degree')}${radio('b','학사','degree')}</fieldset>`);
  let s=f.scan();f.doc.querySelector('#a').checked=true;
  assert.match(f.agent('fill',{scanId:s.scanId,entries:[{id:s.controls[0].id,value:'학사'}]}).results[0].reason,/기존/);
  f.doc.querySelector('#a').checked=false;s=f.scan();f.doc.querySelector('#b').replaceWith(f.doc.querySelector('#b').cloneNode());
  assert.match(f.agent('fill',{scanId:s.scanId,entries:[{id:s.controls[0].id,value:'학사'}]}).results[0].reason,/바뀌/);
});
function searchFixture(){
  const f=fixture(`<button type="button" id="school">학교검색</button><button type="button" id="major">전공검색</button><button type="submit" id="submit">최종 제출</button><dialog hidden role="dialog"><input aria-label="학교 검색어"><button type="button" id="query">검색</button><div id="results"></div></dialog>`);
  f.doc.querySelector('#school').onclick=()=>f.doc.querySelector('dialog').hidden=false;
  f.doc.querySelector('#query').onclick=()=>{f.doc.querySelector('#results').innerHTML='<button type="button">모아대학교</button><button type="button">모아대학교 다른캠퍼스</button>';};
  const s=f.scan();const call=(action,extra={})=>f.agent(action,{scanId:s.scanId,...extra});
  return {...f,s,call,open:()=>call('search-open',{id:s.controls.find(c=>c.label==='학교명').id,value:'모아대학교'})};
}

// Reproduce the supplied diagnostic's searchResultList/li/button.ellipsis/strong,
// with synthetic names and site-owned selection handlers only.
function inlineSchoolFixture(){
  const f=fixture(`<form><input name="college[0].score" title="평점">
    <div class="span per80 middle-set"><div class="search"><label><input type="search" class="text"><span class="label">학교검색</span></label><div class="searchResult" hidden></div></div>
    <input type="hidden" name="college[0].academyCode"><span class="searchResultName"></span></div><button type="submit">최종 제출</button></form>`);
  const input=f.doc.querySelector('input[type=search]'),code=f.doc.querySelector('input[type=hidden]'),name=f.doc.querySelector('.searchResultName'),list=f.doc.querySelector('.searchResult');
  const counts={clicks:0,submits:0};f.doc.querySelector('form').onsubmit=e=>{counts.submits++;e.preventDefault();};
  const show=(names=['모아대학교'],{type='button',reflect=true}={})=>{
    list.hidden=false;list.innerHTML='<ul class="searchResultList"></ul>';
    for(const text of names){const li=f.doc.createElement('li'),b=f.doc.createElement('button');b.className='ellipsis';if(type!==null)b.type=type;
      const strong=f.doc.createElement('strong');strong.textContent='모아';b.append(strong,text.slice(2));
      b.onclick=()=>{counts.clicks++;if(reflect){code.value='site-owned-id';name.textContent=text;input.value='';list.hidden=true;}};
      li.append(b);list.firstChild.append(li);
    }
  };
  const s=f.agent('scan',{education:true,family:'college'});
  const open=()=>f.agent('search-open',{scanId:s.scanId,id:s.controls.find(c=>c.label==='학교명').id,value:'모아대학교'});
  return {...f,input,code,name,list,show,counts,s,open};
}

test('HS 학교 검색은 지연된 24개 결과 중 전체 이름이 일치하는 하나를 선택하고 반영을 확인한다',async()=>{
  const f=inlineSchoolFixture();
  try{
    f.input.addEventListener('keyup',()=>setTimeout(()=>f.show(['모아대학교',...Array.from({length:23},(_,i)=>`모아대학교 (${i}캠퍼스)`)]),40));
    const pending=f.open();assert.equal(f.input.value,'모아대학교');assert.equal(f.code.value,'');
    assert.ok((await pending).selected);assert.equal(f.counts.clicks,1);assert.equal(f.counts.submits,0);assert.equal(f.name.textContent,'모아대학교');
    const after=f.agent('scan',{education:true,family:'college'});
    assert.equal(automaticPlan(after.controls,[]).find(c=>c.label==='학교명').status,'kept');
    assert.ok(f.open().error);
  }finally{await f.w.happyDOM.close();}
});

test('HS 학교 검색은 같은 검색어의 기존 결과도 선택하고 중복 실행은 막는다',async()=>{
  const f=inlineSchoolFixture();
  try{f.input.value='모아대학교';f.show();const p=f.open();assert.match(f.open().error,/진행 중/);assert.ok((await p).selected);assert.equal(f.counts.clicks,1);}
  finally{await f.w.happyDOM.close();}
});

test('HS 검색은 중복·제출 버튼·입력 변경·화면 변경 시 선택하지 않는다',async()=>{
  const scenarios=[
    f=>f.input.addEventListener('input',()=>f.show(['모아대학교','모아대학교'])),
    f=>f.input.addEventListener('input',()=>f.show(['모아대학교'],{type:null})),
    f=>f.input.addEventListener('input',()=>{f.show();setTimeout(()=>{f.input.value='다른대학교';},50);}),
    f=>f.input.addEventListener('input',()=>{f.show();setTimeout(()=>{f.input.remove();},50);}),
    f=>f.input.addEventListener('input',()=>{f.show();setTimeout(()=>f.agent('scan'),50);}),
    f=>f.input.addEventListener('input',()=>{f.show();setTimeout(()=>{f.code.name='graduateSchool[0].academyCode';},50);}),
    f=>f.input.addEventListener('input',()=>{f.show();setTimeout(()=>f.show(['모아대학교','모아대학교']),100);}),
  ];
  await Promise.all(scenarios.map(async setup=>{const f=inlineSchoolFixture();try{setup(f);assert.ok((await f.open()).error);assert.equal(f.counts.clicks,0);assert.equal(f.counts.submits,0);assert.equal(f.code.value,'');}finally{await f.w.happyDOM.close();}}));
});

test('HS 학교 검색은 다른 기존 검색어와 선택된 내부 코드를 보존한다',async()=>{
  const f=inlineSchoolFixture();try{f.input.value='기존검색';assert.ok(f.open().error);assert.equal(f.input.value,'기존검색');f.input.value='';f.code.value='existing-id';assert.ok(f.open().error);assert.equal(f.code.value,'existing-id');assert.equal(f.counts.clicks,0);}finally{await f.w.happyDOM.close();}
});

test('HS 검색은 다른 캠퍼스·묵은 결과를 선택하지 않고 반영 없는 클릭을 완료로 보고하지 않는다',async()=>{
  await Promise.all([
    {setup:f=>f.input.addEventListener('input',()=>f.show(['모아대학교 (서울캠퍼스)'])),clicks:0},
    {setup:f=>f.show(),clicks:0},
    {setup:f=>f.input.addEventListener('input',()=>f.show(['모아대학교'],{reflect:false})),clicks:1},
  ].map(async({setup,clicks})=>{const f=inlineSchoolFixture();try{setup(f);const r=await f.open();assert.ok(r.error);assert.ok(!r.selected);assert.equal(f.counts.clicks,clicks);assert.equal(f.counts.submits,0);assert.equal(f.code.value,'');}finally{await f.w.happyDOM.close();}}));
});
test('학교 검색은 명시적으로 열고 검색한 뒤 일치 결과를 사용자 선택으로 실행한다',()=>{
  const f=searchFixture();assert.equal(f.s.controls.filter(c=>c.type==='search').length,2);
  let submitted=0,selected=0;f.doc.querySelector('#submit').onclick=()=>submitted++;
  assert.ok(f.open().ok);assert.ok(f.call('search-query').ok);assert.equal(f.doc.querySelector('dialog input').value,'모아대학교');
  const r=f.call('search-results');assert.equal(r.results.length,1);f.doc.querySelector('#results button').onclick=()=>selected++;
  assert.equal(selected,0);assert.ok(f.call('search-select',{id:r.results[0].id}).ok);assert.equal(selected,1);assert.equal(submitted,0);
  assert.ok(f.call('search-select',{id:r.results[0].id}).error);
});
test('검색창·검색어·결과가 불명확하면 자동 선택하지 않는다',()=>{
  const f=searchFixture();f.open();f.doc.querySelector('dialog input').value='기존검색';assert.ok(f.call('search-query').error);
  assert.equal(f.doc.querySelector('dialog input').value,'기존검색');f.doc.querySelector('dialog input').value='';f.call('search-query');
  f.doc.querySelector('#results').innerHTML='<button type="button">모아대학교</button><button type="button">모아대학교</button>';
  assert.equal(f.call('search-results').results.length,0);
  f.doc.querySelector('#results').innerHTML='<button type="button">모아대학교</button>';const r=f.call('search-results');f.doc.querySelector('#results button').textContent='다른대학교';
  assert.ok(f.call('search-select',{id:r.results[0].id}).error);assert.ok(f.scan().error);
});
test('검색 버튼 없는 사이트와 닫힌·여러 검색창에서 임의 클릭하지 않는다',()=>{
  const f=searchFixture();assert.ok(f.call('search-open',{id:'fake',value:'모아대학교'}).error);f.open();
  f.doc.body.insertAdjacentHTML('beforeend','<div role="dialog"><input></div>');assert.ok(f.call('search-query').error);
});
