import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import vm from 'node:vm';
import {randomUUID} from 'node:crypto';
import {formAgent,automaticPlan} from '../extension/autofill-core.js';

function fixture(html){
  const w=new Window({url:'https://s-oil.recruiter.co.kr/v1/applicant/resume-form/123?step=2'});w.document.body.innerHTML=html;
  w.HTMLElement.prototype.getClientRects=function(){return this.closest('[hidden]')?[]:[{}];};
  const ctx=vm.createContext({document:w.document,location:w.location,URL,crypto:{randomUUID},getComputedStyle:w.getComputedStyle.bind(w),HTMLInputElement:w.HTMLInputElement,HTMLSelectElement:w.HTMLSelectElement,Event:w.Event,MutationObserver:w.MutationObserver,setTimeout,clearTimeout});
  const agent=vm.runInContext('('+formAgent.toString()+')',ctx);
  const scan=agent('scan');return {w,doc:w.document,agent,ctx,scan,fill:(entries)=>agent('fill',{scanId:scan.scanId,entries})};
}
// Static academic choices are synthetic; grouping follows the supplied li/button structure.
const group=(label,options,attr='aria-pressed="false"')=>`<div><span>${label}</span><div><div>${options.map(o=>`<li class="ats-list-none"><button type="button" ${attr}>${o}</button></li>`).join('')}</div></div></div>`;

test('전공 검색 안내를 인식하고 결과 선택 연결 전에는 일반 텍스트처럼 입력하지 않는다',async()=>{
  const f=fixture('<section><input placeholder="전공명을 검색해주세요."><button type="button" disabled><span>전공계열을 선택해주세요.</span></button></section>');try{
    assert.deepEqual(Array.from(f.scan.controls,c=>c.label).sort(),['전공명','전공계열'].sort());
    assert.ok(automaticPlan(f.scan.controls,[{key:'major',label:'주전공',value:'모아학과'}]).every(c=>c.status==='pending'));
    assert.equal(f.fill([{id:f.scan.controls.find(c=>c.label==='전공명').id,value:'모아학과'}]).results[0].ok,false);
    assert.equal(f.doc.querySelector('input').value,'');
    const d=f.agent('diagnose');assert.equal(d.collectorVersion,'0.2.36');assert.ok(d.fields.some(c=>c.label==='전공명'));assert.ok(d.fields.some(c=>c.label==='전공계열'));assert.ok(d.choiceStructures.some(c=>c.label==='전공명'));
  }finally{await f.w.happyDOM.close();}
});

test('전공 입력 뒤 역할 없는 검색 목록이 닫혀도 구조를 기억하며 검색어와 결과 이름은 제외한다',async()=>{
  const f=fixture('<main><section><input placeholder="전공명을 검색해주세요."><button type="button">전공계열을 선택해주세요.</button></section></main>');try{
    assert.equal(f.agent('watch-search').watching,2);
    const input=f.doc.querySelector('input');input.value='PRIVATE_MAJOR_QUERY';input.dispatchEvent(new f.w.Event('input',{bubbles:true}));
    const popup=f.doc.createElement('div');popup.innerHTML='<ul><li><button type="button" class="major-result">PRIVATE_MAJOR_RESULT</button></li></ul>';f.doc.body.append(popup);
    await new Promise(r=>setTimeout(r,25));popup.remove();await new Promise(r=>setTimeout(r,25));
    const d=f.agent('diagnose');assert.equal(d.watchStatus.inputEvents,1);assert.ok(d.recordedChangeStructures.some(c=>c.label==='전공명 변화 영역'&&c.nodes.some(n=>n.classes.includes('major-result'))));assert.ok(!JSON.stringify(d).includes('PRIVATE_'));assert.equal(input.value,'PRIVATE_MAJOR_QUERY');
  }finally{vm.runInContext('globalThis.__moaSearchWatch?.stop()',f.ctx);await f.w.happyDOM.close();}
});

test('전공계열에 포커스를 둔 뒤 열린 목록도 별도 전공계열 구조로 기록한다',async()=>{
  const f=fixture('<section><button type="button"><span>전공계열을 선택해주세요.</span></button></section>');try{
    f.agent('watch-search');f.doc.querySelector('span').dispatchEvent(new f.w.Event('pointerdown',{bubbles:true}));
    const menu=f.doc.createElement('div');menu.innerHTML='<button type="button" class="major-category-result">PRIVATE_CATEGORY</button>';f.doc.body.append(menu);await new Promise(r=>setTimeout(r,25));
    const d=f.agent('diagnose');assert.ok(d.recordedChangeStructures.some(c=>c.label==='전공계열 변화 영역'&&c.nodes.some(n=>n.classes.includes('major-category-result'))));assert.ok(!JSON.stringify(d).includes('PRIVATE_CATEGORY'));
  }finally{vm.runInContext('globalThis.__moaSearchWatch?.stop()',f.ctx);await f.w.happyDOM.close();}
});

test('S-OIL 졸업 기본 선택을 저장된 수료로 바꾸고 변경 전후를 미리보기에 제공한다',async()=>{
  for(const style of ['aria','ats']){
    const f=fixture(group('졸업구분',['졸업','졸업예정','수료','휴학'],''));try{
      const buttons=[...f.doc.querySelectorAll('button')];
      const select=target=>buttons.forEach(b=>style==='aria'?b.setAttribute('aria-pressed',String(b===target)):b.className=b===target?'ats-b1-bold ats-shadow-1 ats-bg-white ats-text-gray-800':'ats-b1 ats-text-gray-600 ats-bg-gray-80');
      select(buttons[0]);buttons.forEach(b=>b.onclick=()=>select(b));
      const scan=f.agent('scan'),fields=[{key:'status',label:'재학 상태',value:'수료'}];
      const plan=automaticPlan(scan.controls,fields);assert.equal(plan[0].status,'ready');assert.equal(plan[0].selectedValue,'졸업');assert.equal(plan[0].value,'수료');
      assert.equal(f.agent('fill',{scanId:scan.scanId,entries:plan.map(c=>({id:c.id,value:c.value}))}).results[0].ok,true);
      const after=f.agent('scan');assert.equal(after.controls[0].selectedValue,'수료');assert.equal(automaticPlan(after.controls,fields)[0].status,'kept');
    }finally{await f.w.happyDOM.close();}
  }
});

test('졸업구분 변경은 기존 선택 변경·불명확한 상태·중복·비활성·클릭 미반영을 구분한다',async()=>{
  for(const scenario of ['changed','unknown','multiple','duplicate','disabled','replaced','no-effect','two-selected']){
    const f=fixture(group('졸업구분',['졸업','수료','휴학']));try{
      const buttons=[...f.doc.querySelectorAll('button')];buttons[0].setAttribute('aria-pressed','true');
      const scan=f.agent('scan');let clicks=0;
      buttons[1].onclick=()=>{clicks++;if(scenario==='two-selected')buttons[1].setAttribute('aria-pressed','true');};
      if(scenario==='changed'){buttons[0].setAttribute('aria-pressed','false');buttons[2].setAttribute('aria-pressed','true');}
      if(scenario==='unknown')buttons[0].removeAttribute('aria-pressed');
      if(scenario==='multiple')buttons[2].setAttribute('aria-pressed','true');
      if(scenario==='duplicate')buttons[2].textContent='수료';
      if(scenario==='disabled')buttons[1].disabled=true;
      if(scenario==='replaced')buttons[1].replaceWith(buttons[1].cloneNode(true));
      const result=f.agent('fill',{scanId:scan.scanId,entries:[{id:scan.controls[0].id,value:'수료'}]});
      assert.equal(result.results[0].ok,false,scenario);assert.equal(clicks,['no-effect','two-selected'].includes(scenario)?1:0,scenario);
    }finally{await f.w.happyDOM.close();}
  }
});

test('졸업구분의 저장값 누락·불일치·중복 구역은 보류하고 학위·입학구분은 계속 보호한다',async()=>{
  const f=fixture(group('학위구분',['학사','전문학사'])+group('입학구분',['입학','편입'])+group('졸업구분',['졸업','수료']));try{
    const buttons=[...f.doc.querySelectorAll('button')];[0,2,4].forEach(i=>buttons[i].setAttribute('aria-pressed','true'));
    const scan=f.agent('scan');
    for(const value of ['수료','','알 수 없음']){
      const plan=automaticPlan(scan.controls,[{key:'degree',label:'학위',value:'전문학사'},{key:'admissionType',label:'입학 구분',value:'편입'},{key:'status',label:'재학 상태',value}]);
      assert.equal(plan[0].status,'kept');assert.equal(plan[1].status,'kept');assert.equal(plan[2].status,value==='수료'?'ready':'pending');
    }
    const c=scan.controls[2];assert.ok(automaticPlan([c,{...c,id:'another'}],[{key:'status',label:'재학 상태',value:'수료'}]).every(p=>p.status==='pending'));
    assert.equal(f.agent('fill',{scanId:scan.scanId,entries:[{id:scan.controls[1].id,value:'편입'}]}).results[0].ok,false);
  }finally{await f.w.happyDOM.close();}
});

test('S-OIL 선택 버튼 묶음을 인식하고 명시적인 미선택 상태일 때만 채운다',async()=>{
  const f=fixture(group('학위구분',['전문학사','학사'])+group('입학구분',['입학','편입'])+group('졸업구분',['졸업','졸업예정','수료','중퇴','휴학','재학']));
  try{
    for(const b of f.doc.querySelectorAll('button'))b.onclick=()=>b.setAttribute('aria-pressed','true');
    const fields=[{key:'degree',label:'학위',value:'학사'},{key:'admissionType',label:'입학 구분',value:'신입학'},{key:'status',label:'재학 상태',value:'졸업 예정'}];
    const plan=automaticPlan(f.scan.controls,fields);assert.equal(plan.length,3);assert.ok(plan.every(c=>c.status==='ready'));
    const result=f.fill(plan.map(c=>({id:c.id,value:c.value})));assert.ok(result.results.every(r=>r.ok));
    assert.deepEqual([...f.doc.querySelectorAll('[aria-pressed=true]')].map(b=>b.textContent),['학사','입학','졸업예정']);
    assert.ok(f.fill(plan.map(c=>({id:c.id,value:c.value}))).results.every(r=>!r.ok));
  }finally{await f.w.happyDOM.close();}
});

test('S-OIL 실제 선택 상태가 누락된 버튼은 보류하고 기존 선택을 바꾸지 않는다',async()=>{
  for(const attr of ['', 'aria-pressed="true"', 'aria-pressed="false" data-selected="true"']){
    const f=fixture(group('학위구분',['전문학사','학사'],attr));try{
      let clicks=0;for(const b of f.doc.querySelectorAll('button'))b.onclick=()=>clicks++;
      assert.ok(f.scan.controls[0].unsupported||f.scan.controls[0].filled);
      assert.equal(f.fill([{id:f.scan.controls[0].id,value:'학사'}]).results[0].ok,false);assert.equal(clicks,0);
    }finally{await f.w.happyDOM.close();}
  }
});

test('S-OIL 버튼 교체·비활성·동명이면 클릭하지 않고 반영되지 않은 클릭도 성공으로 알리지 않는다',async()=>{
  for(const scenario of ['replace','disable','duplicate','unconfirmed']){
    const f=fixture(group('학위구분',['전문학사','학사']));try{
      let clicks=0;const b=f.doc.querySelectorAll('button')[1];b.onclick=()=>clicks++;
      if(scenario==='replace')b.replaceWith(b.cloneNode(true));
      if(scenario==='disable')b.disabled=true;
      if(scenario==='duplicate')f.doc.querySelector('button').textContent='학사';
      const r=f.fill([{id:f.scan.controls[0].id,value:'학사'}]);assert.equal(r.results[0].ok,false);assert.equal(clicks,scenario==='unconfirmed'?1:0);
    }finally{await f.w.happyDOM.close();}
  }
});

test('S-OIL 연월 형식이 명시된 날짜칸만 일자를 만들지 않고 변환한다',async()=>{
  for(const [hint,expected] of [['YYYY.MM','2020.03'],['YYYY-MM','2020-03'],['YYYY/MM','2020/03'],['YYYYMM','202003'],['YYYY.MM.DD',null],['',null]]){
    const f=fixture(`<input type="text" aria-label="입학일" placeholder="${hint}">`);try{
      const fields=[{key:'startMonth',label:'입학 연월',value:'2020-03'}],plan=automaticPlan(f.scan.controls,fields);
      assert.equal(plan[0].status,expected?'ready':'pending');const r=f.fill([{id:f.scan.controls[0].id,value:'2020-03'}]);assert.equal(r.results[0].ok,Boolean(expected));assert.equal(f.doc.querySelector('input').value,expected||'');
    }finally{await f.w.happyDOM.close();}
  }
});

test('S-OIL 날짜 형식 변경과 잘못된 월은 입력하지 않는다',async()=>{
  for(const changed of [true,false]){const f=fixture('<input aria-label="졸업일" placeholder="YYYY.MM">');try{
    if(changed)f.doc.querySelector('input').placeholder='YYYY.MM.DD';
    assert.equal(f.fill([{id:f.scan.controls[0].id,value:changed?'2024-02':'2024-13'}]).results[0].ok,false);assert.equal(f.doc.querySelector('input').value,'');
  }finally{await f.w.happyDOM.close();}}
});

test('S-OIL 만점·전공의 전용 선택창은 누락하지 않고 확인 필요 항목으로 표시한다',async()=>{
  const f=fixture('<div><span>만점기준</span><div><button type="button">선택</button></div></div><div><span>전공</span><div><button type="button">찾기</button></div></div>');try{
    assert.equal(f.scan.controls.length,2);assert.ok(f.scan.controls.every(c=>c.unsupported));assert.ok(automaticPlan(f.scan.controls,[]).every(c=>c.status==='pending'));
  }finally{await f.w.happyDOM.close();}
});

test('S-OIL 진단은 공개 선택지·선택 상태·형식만 보완하고 저장된 개인 값은 제외한다',async()=>{
  const f=fixture(group('학위구분',['전문학사','학사'])+'<input aria-label="입학일" placeholder="YYYY.MM" value="PRIVATE_DATE"><input aria-label="학교명" value="PRIVATE_SCHOOL"><textarea>PRIVATE_ESSAY</textarea>');try{
    const d=f.agent('diagnose');assert.equal(d.fields[0].choice,'전문학사');assert.equal(d.fields[0].selected,false);assert.equal(d.fields.find(x=>x.label==='입학일').monthFormat,'YYYY.MM');assert.ok(!JSON.stringify(d).includes('PRIVATE_'));
  }finally{await f.w.happyDOM.close();}
});

test('첨부 화면의 학교 검색·소재지·학과계열 안내 문구를 인식하되 단순 문자열로 입력하지 않는다',async()=>{
  const f=fixture('<section><input placeholder="학교명을 검색해주세요."><button type="button"><span>학교 소재지를 선택해주세요.</span></button><button type="button">학과계열을 선택해주세요.</button></section>');
  try{
    assert.deepEqual(Array.from(f.scan.controls,c=>c.label).sort(),['학교명','학교소재지','학과계열'].sort());assert.ok(f.scan.controls.every(c=>c.unsupported));
    const d=f.agent('diagnose');assert.ok(d.fields.some(c=>c.label==='학교명'));assert.ok(d.choiceStructures.length>=3);
    assert.equal(f.fill([{id:f.scan.controls.find(c=>c.label==='학교명').id,value:'모아대학교'}]).results[0].ok,false);assert.equal(f.doc.querySelector('input').value,'');
  }finally{await f.w.happyDOM.close();}
});

test('S-OIL 선택창이 닫힌 뒤에도 결과 구조를 보존하고 검색어·학교명·본문은 수집하지 않는다',async()=>{
  const f=fixture('<section><span>학교명을 검색해주세요.</span><button type="button">만점 기준</button></section>');
  try{
    assert.equal(f.agent('watch-search').watching,2);
    const popup=f.doc.createElement('div');popup.setAttribute('role','dialog');popup.innerHTML='<input type="search" value="PRIVATE_QUERY"><ul role="listbox"><li role="option"><button type="button">PRIVATE_SCHOOL</button></li></ul><textarea>PRIVATE_ESSAY</textarea>';f.doc.body.append(popup);
    popup.querySelector('input').dispatchEvent(new f.w.Event('input',{bubbles:true}));await new Promise(r=>setTimeout(r,25));popup.remove();await new Promise(r=>setTimeout(r,25));
    const d=f.agent('diagnose');assert.ok(d.recordedChoiceStructures.some(s=>s.nodes.some(n=>n.role==='option')));assert.equal(d.watchStatus.inputEvents,1);assert.ok(!JSON.stringify(d).includes('PRIVATE_'));
    vm.runInContext('globalThis.__moaSearchWatch.stop()',f.ctx);assert.equal(f.agent('diagnose').watchStatus.active,false);
  }finally{vm.runInContext('globalThis.__moaSearchWatch?.stop()',f.ctx);await f.w.happyDOM.close();}
});

test('명시적인 일반 만점 select는 선택창 안내 문구 보완 후에도 입력할 수 있다',async()=>{
  const f=fixture('<select title="만점 기준"><option value="">선택</option><option value="scale45">4.5</option></select>');try{
    assert.equal(f.scan.controls[0].unsupported,false);assert.equal(f.fill([{id:f.scan.controls[0].id,value:'4.5'}]).results[0].ok,true);assert.equal(f.doc.querySelector('select').value,'scale45');
  }finally{await f.w.happyDOM.close();}
});

test('실제 진단과 화면으로 대조한 S-OIL 선택 스타일은 기존 선택으로 인식한다',async()=>{
  const f=fixture(group('학위구분',['학사','전문학사'],''));try{
    const buttons=f.doc.querySelectorAll('button');buttons[0].className='ats-b1-bold ats-shadow-1 ats-bg-white ats-text-gray-800';buttons[1].className='ats-b1 ats-text-gray-600 ats-bg-gray-80';
    const s=f.agent('scan');assert.equal(s.controls[0].filled,true);assert.equal(s.controls[0].unsupported,false);
    assert.equal(automaticPlan(s.controls,[{key:'degree',label:'학위',value:'학사'}])[0].status,'kept');
    assert.match(f.agent('fill',{scanId:s.scanId,entries:[{id:s.controls[0].id,value:'전문학사'}]}).results[0].reason,/기존 선택/);
    buttons[0].setAttribute('aria-pressed','false');assert.equal(f.agent('scan').controls[0].unsupported,true);
  }finally{await f.w.happyDOM.close();}
});

test('학교 입력 이후 바깥에 나타난 역할 없는 결과 목록도 닫힌 뒤 구조를 보존한다',async()=>{
  const f=fixture('<main><section><input placeholder="학교명을 검색해주세요."></section></main>');try{
    f.agent('watch-search');const input=f.doc.querySelector('input');input.value='PRIVATE_QUERY';input.dispatchEvent(new f.w.Event('input',{bubbles:true}));
    const popup=f.doc.createElement('div');popup.className='untyped-portal';popup.innerHTML='<ul><li><button type="button" class="school-choice">PRIVATE_SCHOOL</button></li></ul><textarea>PRIVATE_ESSAY</textarea>';f.doc.body.append(popup);
    await new Promise(r=>setTimeout(r,25));popup.remove();await new Promise(r=>setTimeout(r,25));
    const d=f.agent('diagnose');assert.ok(d.watchStatus.changedRegions>0);assert.ok(d.recordedChangeStructures.some(s=>s.nodes.some(n=>n.classes.includes('school-choice'))));assert.ok(!JSON.stringify(d).includes('PRIVATE_'));
    assert.ok(!f.doc.querySelector('.school-choice'));assert.equal(input.value,'PRIVATE_QUERY');
  }finally{vm.runInContext('globalThis.__moaSearchWatch?.stop()',f.ctx);await f.w.happyDOM.close();}
});

test('선택창 변화 기록은 학적 입력 전에는 만들지 않고 시작할 때 이전 기록을 지운다',async()=>{
  const f=fixture('<section><input placeholder="학교명을 검색해주세요."></section>');try{
    f.agent('watch-search');const popup=f.doc.createElement('div');popup.innerHTML='<button type="button">PRIVATE_OTHER</button>';f.doc.body.append(popup);await new Promise(r=>setTimeout(r,20));assert.equal(f.agent('diagnose').recordedChangeStructures.length,0);
    f.doc.querySelector('input').dispatchEvent(new f.w.Event('input',{bubbles:true}));popup.append(f.doc.createElement('span'));await new Promise(r=>setTimeout(r,20));assert.ok(f.agent('diagnose').recordedChangeStructures.length>0);
    f.agent('watch-search');assert.equal(f.agent('diagnose').recordedChangeStructures.length,0);
  }finally{vm.runInContext('globalThis.__moaSearchWatch?.stop()',f.ctx);await f.w.happyDOM.close();}
});
