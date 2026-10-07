import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import vm from 'node:vm';
import {randomUUID} from 'node:crypto';
import {formAgent,automaticPlan} from '../extension/autofill-core.js';

const monthInput=label=>`<div class="ats-radius-75 ats-group ats-flex"><input type="text" class="ats-outline-none ats-px-50 ats-shrink ats-bg-gray-80" placeholder="${label}" maxlength="7"></div>`;
function fixture(html=monthInput('입학일')+monthInput('졸업일')){
  const w=new Window({url:'https://s-oil.recruiter.co.kr/v1/applicant/resume-form/123?step=2'}),doc=w.document;doc.body.innerHTML=html;
  w.HTMLElement.prototype.getClientRects=function(){return this.closest('[hidden]')?[]:[{}];};
  const ctx=vm.createContext({document:doc,location:w.location,URL,crypto:{randomUUID},getComputedStyle:w.getComputedStyle.bind(w),HTMLInputElement:w.HTMLInputElement,HTMLSelectElement:w.HTMLSelectElement,Event:w.Event,MutationObserver:w.MutationObserver,setTimeout:(fn,ms)=>setTimeout(fn,ms===1000?80:ms===5000?500:ms),clearTimeout});
  const agent=vm.runInContext('('+formAgent.toString()+')',ctx);const scan=agent('scan');
  const fill=entries=>agent('fill',{scanId:scan.scanId,entries});return {w,doc,agent,ctx,scan,fill};
}

test('관찰된 S-OIL 입학·졸업 칸을 저장 연월에 연결하고 일자를 만들지 않는다',async()=>{
  const f=fixture();try{
    const fields=[{key:'startMonth',label:'입학 연월',value:'2020-03'},{key:'endMonth',label:'졸업·졸업 예정 연월',value:'2024-02'}];
    const plan=automaticPlan(f.scan.controls,fields);assert.ok(plan.every(c=>c.status==='ready'));
    let blurs=0;for(const e of f.doc.querySelectorAll('input'))e.addEventListener('blur',()=>blurs++);
    const result=await f.fill(plan.map(c=>({id:c.id,value:c.value})));assert.ok(result.results.every(r=>r.ok),JSON.stringify(result));
    assert.deepEqual([...f.doc.querySelectorAll('input')].map(e=>e.value),['2020.03','2024.02']);assert.equal(blurs,2);
  }finally{await f.w.happyDOM.close();}
});

test('동일한 연월로 사이트가 표기를 바꾼 경우만 허용하고 날짜 추가·변경·지연 비움은 실패 처리한다',async()=>{
  for(const target of ['2020-03','2020/3','202003','2020.03.01','2020.04','']){
    const f=fixture(monthInput('입학일'));try{
      const input=f.doc.querySelector('input');input.addEventListener('input',()=>setTimeout(()=>{input.value=target;},20));
      const r=await f.fill([{id:f.scan.controls[0].id,value:'2020-03'}]);assert.equal(r.results[0].ok,['2020-03','2020/3','202003'].includes(target),target);assert.equal(input.value,target);
    }finally{await f.w.happyDOM.close();}
  }
});

test('다른 날짜 칸·기존값·비활성·잘못된 월·명시된 입력 제한에는 임의로 쓰지 않는다',async()=>{
  for(const mode of ['generic','day','existing','disabled','readonly','invalid','maxlength','pattern']){
    const html=mode==='generic'?'<input placeholder="입학일">':mode==='day'?'<input type="date" aria-label="입학일">':monthInput('입학일');
    const f=fixture(html);try{
      const input=f.doc.querySelector('input');if(mode==='existing')input.value='2018.03';if(mode==='disabled')input.disabled=true;if(mode==='readonly')input.readOnly=true;if(mode==='maxlength')input.maxLength=6;if(mode==='pattern')input.pattern='[0-9]{6}';
      const r=await f.fill([{id:f.scan.controls[0].id,value:mode==='invalid'?'2020-13':'2020-03'}]);assert.equal(r.results[0].ok,false,mode);assert.equal(input.value,mode==='existing'?'2018.03':'');
    }finally{await f.w.happyDOM.close();}
  }
});

test('학과계열은 저장된 별도 값에 연결하며 전공으로 추측하지 않고 정확한 선택지만 고른다',async()=>{
  for(const mode of ['match','duplicate','different','no-effect','existing']){
    const f=fixture('<div class="ats-inline-flex ats-flex-col ats-relative ats-group"><button type="button"><p>학과계열을 선택해주세요.</p></button></div>');try{
      const trigger=f.doc.querySelector('button'),root=trigger.parentElement;let clicks=0;
      if(mode==='existing')trigger.textContent='인문계열';
      trigger.onclick=()=>{
        const menu=f.doc.createElement('div');menu.id='dropdown-body';menu.innerHTML='<div id="design-system-scroll-container"><div class="ats-mr-200"><ul></ul></div></div>';
        for(const text of mode==='duplicate'?['공학계열','공학 계열']:mode==='different'?['자연계열']:['공학계열']){
          const li=f.doc.createElement('li'),b=f.doc.createElement('button');b.type='button';b.textContent=text;b.onclick=()=>{clicks++;if(mode!=='no-effect'){trigger.textContent=text;menu.remove();}};li.append(b);menu.querySelector('ul').append(li);
        }root.append(menu);
      };
      const scan=f.agent('scan');if(mode==='existing'){assert.equal(scan.controls.length,0);continue;}
      assert.equal(automaticPlan(scan.controls,[{key:'major',label:'주전공',value:'컴퓨터공학'}])[0].status,'pending');
      const plan=automaticPlan(scan.controls,[{key:'departmentCategory',label:'학과계열',value:'공학 계열'}]);assert.equal(plan[0].status,'ready');
      const result=await f.agent('fill',{scanId:scan.scanId,entries:[{id:plan[0].id,value:plan[0].value}]});assert.equal(result.results[0].ok,mode==='match');assert.equal(clicks,['match','no-effect'].includes(mode)?1:0);
    }finally{await f.w.happyDOM.close();}
  }
});

test('날짜 입력 포커스 뒤 열린 선택창도 개인정보 없이 구조 기록에 포함한다',async()=>{
  const f=fixture(monthInput('입학일'));try{
    f.agent('watch-search');f.doc.querySelector('input').focus();
    const calendar=f.doc.createElement('div');calendar.className='calendar-fixture';calendar.innerHTML='<button type="button">PRIVATE_MONTH</button>';f.doc.body.append(calendar);await new Promise(r=>setTimeout(r,20));
    const d=f.agent('diagnose');assert.ok(d.recordedChangeStructures.some(s=>s.label==='입학일 변화 영역'&&s.nodes.some(n=>n.classes.includes('calendar-fixture'))));assert.ok(!JSON.stringify(d).includes('PRIVATE_MONTH'));
  }finally{vm.runInContext('globalThis.__moaSearchWatch?.stop()',f.ctx);await f.w.happyDOM.close();}
});
