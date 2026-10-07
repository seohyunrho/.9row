import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import vm from 'node:vm';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {formAgent,automaticPlan,allowedPage,educationFamily} from '../extension/autofill-core.js';

// Static headings/order from the screenshot; duplicate title and enabled-control
// states from diagnostic a2bf7cdf. Live interactions remain unverified.
const box=content=>'<div class="ats-inline-flex ats-flex-col ats-relative ats-group">'+content+'</div>';
const group=(label,values)=>'<div>'+(label?'<span>'+label+'</span>':'')+'<div><ul>'+values.map((v,i)=>'<li class="ats-list-none"><button type="button" aria-pressed="'+(i===0)+'">'+v+'</button></li>').join('')+'</ul></div></div>';
const date=label=>'<div class="ats-radius-75 ats-group ats-flex"><input class="ats-outline-none ats-px-50 ats-shrink ats-bg-gray-80" placeholder="'+label+'"></div>';
function fixture(){
  const w=new Window({url:'https://s-oil.recruiter.co.kr/v1/applicant/resume-form/123?step=2'}),doc=w.document,events=[];
  const section=(title,category)=>'<section><h3>- '+title+'<span>*</span></h3>'+group('졸업구분',['졸업','졸업예정','중퇴','휴학','재학'])+'<div>'+box('<div><div><div><input placeholder="학교명을 검색해주세요."></div></div></div>')+box('<button type="button" disabled>학교 소재지를 선택해주세요.</button>')+'</div>'+box('<button type="button" disabled>'+category+'을 선택해주세요.</button>')+group('',['주간','야간'])+date('입학일')+date('졸업일')+'</section>';
  doc.body.innerHTML='<form>'+section('고등학교','계열')+section('대학교','학과계열')+'</form>';
  w.HTMLElement.prototype.getClientRects=function(){return this.closest('[hidden]')?[]:[{}];};
  const high=doc.querySelector('section'),college=doc.querySelectorAll('section')[1];
  const input=high.querySelector('input'),location=high.querySelectorAll('div.ats-inline-flex > button')[0],category=high.querySelectorAll('div.ats-inline-flex > button')[1];
  const list=(root,names,select)=>{const menu=doc.createElement('div');menu.id='dropdown-body';menu.innerHTML='<div id="design-system-scroll-container"><div class="ats-mr-200"><ul class="ats-flex ats-flex-col"></ul></div></div>';for(const name of names){const li=doc.createElement('li');li.className='ats-relative ats-truncate';const b=doc.createElement('button');b.type='button';b.className='ats-truncate';b.textContent=name;b.onclick=()=>{select(name);menu.remove();};li.append(b);menu.querySelector('ul').append(li);}root.append(menu);return menu;};
  input.oninput=()=>{events.push('search');list(input.closest('.ats-inline-flex'),['가상고등학교'],name=>{events.push('school');input.value=name;location.disabled=false;category.disabled=false;});};
  location.onclick=()=>list(location.parentElement,['서울','경기'],value=>{events.push('location');location.textContent=value;});
  category.onclick=()=>list(category.parentElement,['인문계열','자연계열'],value=>{events.push('category');category.textContent=value;});
  for(const root of high.querySelectorAll('ul')){const buttons=[...root.querySelectorAll('button')];buttons.forEach(b=>b.onclick=()=>{events.push(['주간','야간'].includes(b.textContent)?'session':'status');buttons.forEach(x=>x.setAttribute('aria-pressed',String(x===b)));});}
  for(const e of high.querySelectorAll('input[placeholder$="일"]'))e.oninput=()=>events.push(e.placeholder==='입학일'?'start':'end');
  const ctx=vm.createContext({document:doc,location:w.location,URL,crypto:{randomUUID},getComputedStyle:w.getComputedStyle.bind(w),HTMLInputElement:w.HTMLInputElement,HTMLSelectElement:w.HTMLSelectElement,Event:w.Event,KeyboardEvent:w.KeyboardEvent,MutationObserver:w.MutationObserver,setTimeout:(fn,ms)=>setTimeout(fn,ms>=1000?300:ms),clearTimeout});
  const agent=vm.runInContext('('+formAgent.toString()+')',ctx);
  const fields=[{key:'schoolType',value:'고등학교'},{key:'schoolName',value:'가상고등학교'},{key:'location',value:'서울특별시'},{key:'status',value:'졸업 예정'},{key:'highSchoolCategory',value:'인문계열'},{key:'highSchoolSession',value:'야간'},{key:'startMonth',value:'2020-03'},{key:'endMonth',value:'2023-02'}];
  const scan=()=>agent('scan',{education:true,family:'highschool'});
  return {w,doc,high,college,input,location,category,list,fields,events,agent,scan};
}
async function popup(f,recordOverride){
  const w=new Window();w.document.write(readFileSync(new URL('../extension/popup.html',import.meta.url),'utf8'));
  const sections=[{key:'educations',label:'학력',records:recordOverride||[{id:'high',title:'가상고',fields:f.fields}]}];
  const chrome={runtime:{sendMessage:async m=>m.type==='autofill-status'?{ok:true,connected:true,server:'http://127.0.0.1:4318'}:{ok:true,sections}},tabs:{query:async()=>[{id:1,url:f.w.location.href}]},scripting:{executeScript:async({args})=>[{result:await f.agent(...args)}]}};
  vm.runInNewContext(readFileSync(new URL('../extension/popup.js',import.meta.url),'utf8').replace(/^import .*\r?\n/,''),{document:w.document,chrome,allowedPage,formAgent,automaticPlan,educationFamily,setTimeout,URL,navigator:{clipboard:{writeText:async()=>{}}}});
  await new Promise(r=>setImmediate(r));await w.document.querySelector('#load').onclick();await w.document.querySelector('#scan').onclick();return w;
}
test('고등학교와 대학교가 함께 있어도 고등학교 7개 항목만 위에서 아래로 채운다',async()=>{
  const f=fixture();let w;try{
    const before=f.college.outerHTML;w=await popup(f);await w.document.querySelector('#fill').onclick();
    assert.match(w.document.querySelector('#result').textContent,/7개 입력 · 0개 건너뜀/);
    assert.deepEqual(f.events,['status','search','school','location','category','session','start','end']);
    assert.equal(f.input.value,'가상고등학교');assert.equal(f.category.textContent,'인문계열');assert.equal(f.high.querySelector('[placeholder="입학일"]').value,'2020.03');
    assert.equal(f.college.outerHTML,before);assert.ok([...f.college.querySelectorAll('input')].every(e=>e.value===''));
    await w.document.querySelector('#scan').onclick();assert.equal(w.document.querySelector('#fill').disabled,true);
  }finally{await f.w.happyDOM.close();await w?.happyDOM.close();}
});
test('대학교를 선택하면 고등학교 입력칸·계열·주야간은 계획에서 제외한다',async()=>{
  const f=fixture();try{
    const s=f.agent('scan',{education:true,family:'college'});assert.ok(!s.error);
    assert.equal(s.controls.filter(c=>c.label==='학교명').length,1);
    assert.ok(!s.controls.some(c=>['고등학교계열','고등학교주야간'].includes(c.label)));
    assert.equal(s.controls.filter(c=>c.label==='입학일').length,1);
  }finally{await f.w.happyDOM.close();}
});
test('고등학교 제목 누락·중복·접힘·다른 학력 선택은 추측해서 채우지 않는다',async()=>{
  for(const mode of ['missing','duplicate','collapsed','wrong-family']){
    const f=fixture();try{
      if(mode==='missing')f.high.querySelector('h3').remove();
      if(mode==='duplicate')f.high.after(f.high.cloneNode(true));
      if(mode==='collapsed')f.high.querySelector('[placeholder="입학일"]').hidden=true;
      const s=mode==='wrong-family'?f.agent('scan',{education:true,family:'graduateSchool'}):f.scan();assert.ok(s.error,mode);assert.equal(f.events.length,0);
    }finally{await f.w.happyDOM.close();}
  }
});
test('조회 뒤 학력 제목 변경 또는 날짜칸을 다른 구역으로 옮기면 입력하지 않는다',async()=>{
  for(const mode of ['heading','moved']){
    const f=fixture();try{
      const s=f.scan(),c=s.controls.find(c=>c.label==='입학일'),date=f.high.querySelector('[placeholder="입학일"]');
      if(mode==='heading')f.high.querySelector('h3').textContent='- 대학교 *';else f.college.append(date);
      const r=await f.agent('fill',{scanId:s.scanId,entries:[{id:c.id,value:'2020-03'}],order:'top-down'});assert.equal(r.results[0].ok,false);assert.equal(date.value,'');
    }finally{await f.w.happyDOM.close();}
  }
});
test('계열은 정확한 단일 선택지만 고르고 학교명과 선택한 계열은 진단에 싣지 않는다',async()=>{
  const f=fixture();try{
    f.category.disabled=false;f.category.onclick=()=>f.list(f.category.parentElement,['인문계열','인문계열'],value=>{f.category.textContent=value;f.events.push('category');});
    const s=f.scan(),c=s.controls.find(c=>c.label==='고등학교계열');const r=await f.agent('fill',{scanId:s.scanId,entries:[{id:c.id,value:'인문계열'}]});assert.equal(r.results[0].ok,false);assert.equal(f.events.length,0);
    f.doc.querySelector('#dropdown-body')?.remove();f.input.value='PRIVATE_HIGH_SCHOOL';f.category.textContent='PRIVATE_CATEGORY';
    const d=f.agent('diagnose');assert.equal(d.educationStructures.length,2);assert.equal(d.educationStructures[0].family,'highschool');assert.equal(d.educationStructures[0].recognized,true);assert.doesNotMatch(JSON.stringify(d),/PRIVATE_/);
  }finally{await f.w.happyDOM.close();}
});
test('고등학교 검색 실패 시 남은 계열·재학기간은 쓰지 않고 앞선 졸업구분 결과를 알린다',async()=>{
  const f=fixture();f.input.oninput=()=>f.list(f.input.closest('.ats-inline-flex'),['다른고등학교'],()=>f.events.push('wrong-school'));let w;
  try{w=await popup(f);await w.document.querySelector('#fill').onclick();assert.equal(w.document.querySelector('#result').dataset.error,'true');assert.match(w.document.querySelector('#fill-results').textContent,/졸업구분: 입력됨/);assert.equal(f.high.querySelector('[placeholder="입학일"]').value,'');assert.deepEqual(f.events,['status']);}
  finally{await f.w.happyDOM.close();await w?.happyDOM.close();}
});

function batchFixture(){
  const f=fixture(),school=f.college.querySelector('input'),location=f.college.querySelector('div.ats-inline-flex > button');
  school.oninput=()=>{f.events.push('college-search');f.list(school.closest('.ats-inline-flex'),['가상대학교'],name=>{f.events.push('college-school');school.value=name;location.disabled=false;});};
  for(const e of f.college.querySelectorAll('input[placeholder$="일"]'))e.oninput=()=>f.events.push(e.placeholder==='입학일'?'college-start':'college-end');
  const collegeRecord={id:'college',title:'가상대학교',fields:[{key:'schoolType',value:'대학교'},{key:'schoolName',value:'가상대학교'},{key:'startMonth',value:'2023-03'},{key:'endMonth',value:'2027-02'}]};
  // Saved in reverse order; the default whole-education flow still starts at high school.
  const records=[collegeRecord,{id:'high',title:'가상고등학교',fields:f.fields}];
  return {f,records,school};
}
test('진단 a2bf7cdf처럼 같은 학력 글자가 추가 버튼·메뉴에 있어도 실제 날짜 구역만 연결한다',async()=>{
  const {f,records}=batchFixture();let w;try{
    const extras=f.doc.createElement('div');extras.innerHTML='<div class="epe0xe43"><div class="e1kw1b6c0"><svg></svg><p>고등학교</p></div><div class="e1kw1b6c0"><svg></svg><p>대학교</p></div></div><button type="button"><svg></svg><p>대학원</p></button><nav><div class="e1upno410"><p>고등학교</p><svg></svg></div></nav>';
    f.doc.querySelector('form').append(extras);w=await popup(f,records);
    assert.doesNotMatch(w.document.querySelector('#preview').textContent,/제목과 입학/);assert.equal(w.document.querySelector('#fill').disabled,false);
    await w.document.querySelector('#fill').onclick();assert.match(w.document.querySelector('#result').textContent,/10개 입력 · 0건 확인 필요/);
  }finally{await f.w.happyDOM.close();await w?.happyDOM.close();}
});
test('진단의 고등학교처럼 소재지·계열이 처음부터 활성화돼도 빈 학교는 검색한다',async()=>{
  const f=fixture();f.location.disabled=false;f.category.disabled=false;let w;try{
    w=await popup(f);assert.match(w.document.querySelector('#preview').textContent,/가상고등학교/);
    await w.document.querySelector('#fill').onclick();assert.equal(f.input.value,'가상고등학교');assert.ok(f.events.includes('school'));
    assert.match(w.document.querySelector('#result').textContent,/7개 입력 · 0개 건너뜀/);
    await w.document.querySelector('#scan').onclick();assert.equal(w.document.querySelector('#fill').disabled,true);
  }finally{await f.w.happyDOM.close();await w?.happyDOM.close();}
});
test('학교 결과가 한 개여서 스크롤·여백 포장이 달라도 같은 검색창의 정확한 결과를 선택한다',async()=>{
  for(const mode of ['no-scroll','no-margin']){
    const f=fixture();try{
      f.location.disabled=false;
      f.input.oninput=()=>{
        const menu=f.list(f.input.closest('.ats-inline-flex'),['가상고등학교'],name=>{f.input.value=name;f.events.push('school');});
        if(mode==='no-scroll')menu.replaceChildren(menu.querySelector('ul'));
        else menu.querySelector('.ats-mr-200').className='ats-mr-0';
      };
      const s=f.scan(),c=s.controls.find(c=>c.label==='학교명');
      const r=await f.agent('search-open',{scanId:s.scanId,id:c.id,value:'가상고등학교'});
      assert.equal(r.selected,true,JSON.stringify(r));assert.deepEqual(f.events,['school']);
    }finally{await f.w.happyDOM.close();}
  }
});

test('간단한 고등학교 결과 목록도 중복·다른 이름·다른 검색창·알 수 없는 구조는 선택하지 않는다',async()=>{
  for(const mode of ['duplicate','different','other-root','unknown','disabled']){
    const f=fixture();try{
      f.location.disabled=false;
      f.input.oninput=()=>{
        const root=mode==='other-root'?f.college.querySelector('.ats-inline-flex'):f.input.closest('.ats-inline-flex');
        const names=mode==='duplicate'?['가상고등학교','가상고등학교']:mode==='different'?['가상고등학교(다른학교)']:['가상고등학교'];
        const menu=f.list(root,names,()=>f.events.push('unexpected-selection'));
        menu.replaceChildren(menu.querySelector('ul'));
        if(mode==='unknown')menu.querySelector('ul').className='unknown-list';
        if(mode==='disabled')menu.querySelector('button').disabled=true;
      };
      const s=f.scan(),c=s.controls.find(c=>c.label==='학교명');
      const r=await f.agent('search-open',{scanId:s.scanId,id:c.id,value:'가상고등학교'});
      assert.ok(r.error,mode);assert.deepEqual(f.events,[]);assert.doesNotMatch(r.error,/캠퍼스/);
      if(mode==='unknown')assert.match(r.error,/선택 버튼 구조/);
      if(mode==='different')assert.match(r.error,/학교 결과 버튼 1개/);
      if(mode==='duplicate')assert.match(r.error,/같은 이름의 고등학교/);
    }finally{await f.w.happyDOM.close();}
  }
});

test('소재지가 활성화된 고등학교도 기존 학교명과 조회 후 직접 쓴 내용은 유지한다',async()=>{
  for(const when of ['before','after']){
    const f=fixture();try{
      f.location.disabled=false;
      if(when==='before')f.input.value='이미 적은 고등학교';
      const s=f.scan(),c=s.controls.find(c=>c.label==='학교명');
      if(when==='after')f.input.value='이미 적은 고등학교';
      const r=await f.agent('search-open',{scanId:s.scanId,id:c.id,value:'가상고등학교'});
      assert.ok(r.error);assert.equal(f.input.value,'이미 적은 고등학교');assert.deepEqual(f.events,[]);
    }finally{await f.w.happyDOM.close();}
  }
});
test('활성 소재지의 고등학교 검색도 결과가 닫히고 이름이 유지돼야 선택 완료로 표시한다',async()=>{
  for(const mode of ['open-menu','changed-name']){
    const f=fixture();try{
      f.location.disabled=false;
      f.input.oninput=()=>{
        const menu=f.list(f.input.closest('.ats-inline-flex'),['가상고등학교'],()=>{f.input.value='다른고등학교';});
        if(mode==='open-menu')menu.querySelector('button').onclick=()=>{};
      };
      const s=f.scan(),c=s.controls.find(c=>c.label==='학교명');
      const r=await f.agent('search-open',{scanId:s.scanId,id:c.id,value:'가상고등학교'});
      assert.ok(r.error);assert.notEqual(r.selected,true);assert.match(r.error,/선택 완료를 확인하지 못/);
    }finally{await f.w.happyDOM.close();}
  }
});
test('대학교에는 고등학교의 활성 소재지 예외를 적용하지 않는다',async()=>{
  const f=fixture();try{
    f.college.querySelector('div.ats-inline-flex > button').disabled=false;
    const s=f.agent('scan',{education:true,family:'college'}),c=s.controls.find(c=>c.label==='학교명');
    const r=await f.agent('search-open',{scanId:s.scanId,id:c.id,value:'가상대학교'});
    assert.ok(r.error);assert.equal(f.college.querySelector('input').value,'');assert.deepEqual(f.events,[]);
  }finally{await f.w.happyDOM.close();}
});

test('여러 학력은 전체 선택이 기본이며 조회만으로는 쓰지 않고 한 번에 고등학교→대학을 채운다',async()=>{
  const {f,records,school}=batchFixture();let w;try{
    w=await popup(f,records);assert.match(w.document.querySelector('#record').selectedOptions[0].textContent,/학력 전체/);
    assert.match(w.document.querySelector('#preview').textContent,/가상고등학교/);assert.match(w.document.querySelector('#preview').textContent,/가상대학교/);assert.deepEqual(f.events,[]);
    assert.equal(w.document.querySelector('#fill').disabled,false);await w.document.querySelector('#fill').onclick();
    assert.deepEqual(f.events,['status','search','school','location','category','session','start','end','college-search','college-school','college-start','college-end']);
    assert.equal(f.input.value,'가상고등학교');assert.equal(school.value,'가상대학교');assert.equal(f.college.querySelector('[placeholder="입학일"]').value,'2023.03');
    assert.match(w.document.querySelector('#result').textContent,/10개 입력 · 0건 확인 필요/);
    const rows=[...w.document.querySelector('#fill-results').children];assert.equal(rows.length,2);assert.match(rows[0].textContent,/가상고등학교.*7개 입력/);assert.match(rows[1].textContent,/가상대학교.*3개 입력/);
    await w.document.querySelector('#scan').onclick();assert.equal(w.document.querySelector('#fill').disabled,true);
  }finally{await f.w.happyDOM.close();await w?.happyDOM.close();}
});
test('전체 조회에서 인식 못한 고등학교를 표시하며 대학만 채운 결과를 전체 성공으로 표시하지 않는다',async()=>{
  const {f,records,school}=batchFixture();f.high.querySelector('h3').remove();let w;try{
    w=await popup(f,records);assert.match(w.document.querySelector('#preview').textContent,/가상고등학교.*확인 필요/);assert.equal(w.document.querySelector('#fill').disabled,false);
    await w.document.querySelector('#fill').onclick();assert.equal(f.input.value,'');assert.equal(school.value,'가상대학교');assert.deepEqual(f.events,['college-search','college-school','college-start','college-end']);
    assert.match(w.document.querySelector('#result').textContent,/3개 입력 · 1건 확인 필요/);assert.equal(w.document.querySelector('#result').dataset.error,'true');
  }finally{await f.w.happyDOM.close();await w?.happyDOM.close();}
});
test('전체 미리보기 이후 구역이 바뀌면 재조회에서 멈추고 뒤의 학교에 입력하지 않는다',async()=>{
  const {f,records,school}=batchFixture();let w;try{
    w=await popup(f,records);f.high.querySelector('h3').textContent='다른 구역';await w.document.querySelector('#fill').onclick();
    assert.deepEqual(f.events,[]);assert.equal(school.value,'');assert.match(w.document.querySelector('#fill-results').textContent,/앞선 입력이 중단/);assert.equal(w.document.querySelector('#result').dataset.error,'true');
  }finally{await f.w.happyDOM.close();await w?.happyDOM.close();}
});
test('전체 입력 중 학교 검색이 실패하면 앞서 바꾼 졸업구분도 결과에 포함한다',async()=>{
  const {f,records}=batchFixture();f.input.oninput=()=>{};let w;try{
    w=await popup(f,records);await w.document.querySelector('#fill').onclick();assert.deepEqual(f.events,['status']);
    assert.match(w.document.querySelector('#result').textContent,/1개 입력 · 2건 확인 필요/);assert.match(w.document.querySelector('#fill-results').textContent,/졸업구분: 입력됨/);assert.match(w.document.querySelector('#fill-results').textContent,/앞선 입력이 중단/);
  }finally{await f.w.happyDOM.close();await w?.happyDOM.close();}
});
test('같은 학력 종류 기록이 여러 개면 임의로 한 칸에 합치지 않고 개별 선택은 유지한다',async()=>{
  const {f,records,school}=batchFixture();records.push({...records[0],id:'college2',title:'다른대학교'});let w;try{
    w=await popup(f,records);assert.match(w.document.querySelector('#preview').textContent,/같은 학력 종류의 기록이 여러 개/);
    await w.document.querySelector('#fill').onclick();assert.equal(school.value,'');assert.match(w.document.querySelector('#result').textContent,/7개 입력 · 2건 확인 필요/);
    w.document.querySelector('#record').value='college';w.document.querySelector('#record').onchange();await w.document.querySelector('#scan').onclick();await w.document.querySelector('#fill').onclick();assert.equal(school.value,'가상대학교');assert.match(w.document.querySelector('#result').textContent,/3개 입력 · 0개 건너뜀/);
  }finally{await f.w.happyDOM.close();await w?.happyDOM.close();}
});
