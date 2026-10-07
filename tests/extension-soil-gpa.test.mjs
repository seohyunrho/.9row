import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import vm from 'node:vm';
import {randomUUID} from 'node:crypto';
import {formAgent,automaticPlan} from '../extension/autofill-core.js';

function fixture(attrs='',{host='s-oil.recruiter.co.kr',name='collegeGroupAnswers.0.collegeGrade.score'}={}){
  const w=new Window({url:`https://${host}/v1/applicant/resume-form/123?step=2`}),doc=w.document;
  doc.body.innerHTML=`<input type="number" name="${name}" placeholder="평점" ${attrs}>`;
  w.HTMLElement.prototype.getClientRects=()=>[{}];
  const ctx=vm.createContext({document:doc,location:w.location,URL,crypto:{randomUUID},getComputedStyle:w.getComputedStyle.bind(w),HTMLInputElement:w.HTMLInputElement,HTMLSelectElement:w.HTMLSelectElement,Event:w.Event,MutationObserver:w.MutationObserver,setTimeout:(fn,ms)=>setTimeout(fn,ms===1000?80:ms===5000?500:ms),clearTimeout});
  const agent=vm.runInContext('('+formAgent.toString()+')',ctx),scan=agent('scan'),input=doc.querySelector('input');
  const fill=async value=>(await agent('fill',{scanId:scan.scanId,entries:[{id:scan.controls[0].id,value}]})).results[0];
  return {w,doc,input,agent,scan,fill};
}

test('S-OIL의 관찰된 평점칸에 step이 없어도 저장된 소수점 학점을 그대로 입력한다',async()=>{
  const f=fixture('min="0" max="4.5"');try{
    assert.equal(automaticPlan(f.scan.controls,[{key:'gpa',label:'전체 평점',value:'4.19'}])[0].status,'ready');
    const r=await f.fill('4.19');assert.equal(r.ok,true,r.reason);assert.equal(f.input.value,'4.19');assert.equal(f.input.hasAttribute('step'),false);
  }finally{await f.w.happyDOM.close();}
});

test('평점 예외는 해당 S-OIL 필드에만 적용하고 명시적인 범위·step 제한은 지킨다',async()=>{
  for(const [attrs,value,expected,options] of [
    ['min="0" max="4.5"','4.51',false],['min="0"','-0.1',false],['','4.19/4.5',false],['','1e0',false],
    ['step="1"','4.19',false],['step="0.5"','4.19',false],['step="0.25"','4.25',true],['step="any"','4.19',true],
    ['','4.19',false,{name:'otherScore'}],['','4.19',false,{host:'career.hyundai-autoever.com'}]
  ]){
    const f=fixture(attrs,options);try{const r=await f.fill(value);assert.equal(r.ok,expected,`${attrs} ${value} ${JSON.stringify(options)}: ${r.reason}`);assert.equal(f.input.value,expected?value:'');}
    finally{await f.w.happyDOM.close();}
  }
});

test('기존 평점·읽기 전용·비활성·교체된 칸을 유지하고 사이트가 지운 입력은 성공 처리하지 않는다',async()=>{
  for(const mode of ['existing','readonly','disabled','replace','rejected']){
    const f=fixture();try{
      if(mode==='existing')f.input.value='3.5';
      if(mode==='readonly')f.input.readOnly=true;
      if(mode==='disabled')f.input.disabled=true;
      if(mode==='replace')f.input.replaceWith(f.input.cloneNode(true));
      if(mode==='rejected')f.input.addEventListener('input',()=>{f.input.value='';});
      assert.equal((await f.fill('4.19')).ok,false,mode);if(mode==='existing')assert.equal(f.input.value,'3.5');
    }finally{await f.w.happyDOM.close();}
  }
});

test('입력 직후 성공처럼 보여도 blur 또는 늦은 사이트 검증으로 비워지면 실패로 보고한다',async()=>{
  for(const mode of ['blur','delayed','user-edit','navigation','rescan']){
    const f=fixture();try{
      let blurs=0;f.input.addEventListener('blur',()=>{blurs++;if(mode==='blur')f.input.value='';});
      f.input.addEventListener('input',()=>setTimeout(()=>{
        if(mode==='delayed')f.input.value='';
        if(mode==='user-edit')f.input.value='3.2';
        if(mode==='navigation')f.w.location.href='https://s-oil.recruiter.co.kr/v1/applicant/resume-form/123?step=3';
        if(mode==='rescan')f.agent('scan');
      },20));
      assert.equal((await f.fill('4.19')).ok,false,mode);assert.equal(blurs,1);
      if(mode==='user-edit')assert.equal(f.input.value,'3.2');
    }finally{await f.w.happyDOM.close();}
  }
});

test('만점 기준을 먼저 선택하고 평점을 입력하며 만점 선택이 실패하면 평점을 보류한다',async()=>{
  for(const mode of ['success','duplicate','no-effect']){
    const f=fixture('min="0" max="4.5"');try{
      const root=f.doc.createElement('div');root.className='ats-inline-flex ats-flex-col ats-relative ats-group';root.innerHTML='<button type="button"><p>만점 기준</p></button>';f.doc.body.append(root);
      const trigger=root.querySelector('button'),events=[];let writes=0;
      f.input.addEventListener('input',()=>{events.push('score');writes++;if(trigger.textContent!=='4.5')setTimeout(()=>{f.input.value='';},20);});
      trigger.onclick=()=>{
        const menu=f.doc.createElement('div');menu.id='dropdown-body';menu.innerHTML='<div id="design-system-scroll-container"><div class="ats-mr-200"><ul><li><button type="button">4.5</button></li></ul></div></div>';
        if(mode==='duplicate')menu.querySelector('ul').append(menu.querySelector('li').cloneNode(true));
        menu.querySelector('button').onclick=()=>{events.push('scale');if(mode!=='no-effect'){trigger.textContent='4.5';menu.remove();}};root.append(menu);
      };
      const scan=f.agent('scan'),plan=automaticPlan(scan.controls,[{key:'gpa',label:'평점',value:'4.19'},{key:'gpaScale',label:'만점 기준',value:'4.50'}]);
      assert.equal(plan.find(c=>c.label==='만점기준').status,'ready');
      const entries=plan.filter(c=>c.status==='ready').map(c=>({id:c.id,value:c.value}));
      assert.equal(entries[0].value,'4.19'); // Page order is score first; execution must reorder.
      const result=await f.agent('fill',{scanId:scan.scanId,entries});
      if(mode==='success'){assert.ok(result.results.every(r=>r.ok),JSON.stringify(result));assert.deepEqual(events,['scale','score']);assert.equal(f.input.value,'4.19');}
      else{assert.equal(writes,0);assert.equal(result.results.find(r=>r.label==='평점').ok,false);assert.equal(f.input.value,'');}
    }finally{await f.w.happyDOM.close();}
  }
});

test('진단에는 숫자칸 제한만 기록하고 실제 평점 값은 넣지 않는다',async()=>{
  const f=fixture('min="0" max="4.5" step="0.01"');try{
    f.input.value='4.19';const d=f.agent('diagnose'),rules=d.fields[0].numberRules;
    assert.equal(rules.min,'0');assert.equal(rules.max,'4.5');assert.equal(rules.step,'0.01');assert.ok(!JSON.stringify(d).includes('4.19'));
    f.input.removeAttribute('step');assert.equal(f.agent('diagnose').fields[0].numberRules.step,null);
  }finally{await f.w.happyDOM.close();}
});
