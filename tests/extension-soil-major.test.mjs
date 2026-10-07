import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import vm from 'node:vm';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {formAgent,automaticPlan,allowedPage,educationFamily} from '../extension/autofill-core.js';

const on='ats-b1-bold ats-shadow-1 ats-bg-white ats-text-gray-800',off='ats-b1 ats-text-gray-600 ats-bg-gray-80';
// Synthetic names; ancestry, result selectors and grade name follow diagnostic 329c6c44.
function fixture({kind='주전공',initial='',selected=false}={}){
  const w=new Window({url:'https://s-oil.recruiter.co.kr/v1/applicant/resume-form/123?step=2'}),doc=w.document;
  doc.body.innerHTML=`<form><section><div><div><div class="ats-inline-flex ats-flex-col ats-relative ats-group"><div><div><div><input placeholder="전공명을 검색해주세요."></div></div></div></div></div><div>${['주전공','복수전공','부전공'].map(v=>`<li class="ats-list-none"><button type="button" disabled class="${v===kind?on:off}">${v}</button></li>`).join('')}</div></div><div><div class="ats-inline-flex ats-flex-col ats-relative ats-group"><button id="category" type="button" disabled>전공계열을 선택해주세요.</button></div></div><input name="collegeGroupAnswers.0.collegeMajorList.0.majorGrade.score" type="number" placeholder="평점" disabled></section><input type="number" name="collegeGroupAnswers.0.collegeGrade.score" placeholder="평점"></form>`;
  w.HTMLElement.prototype.getClientRects=function(){return this.closest('[hidden]')?[]:[{}];};
  const input=doc.querySelector('input'),category=doc.querySelector('#category'),root=input.closest('.ats-inline-flex'),kinds=[...doc.querySelectorAll('li button')];
  input.value=initial;category.disabled=!selected;let clicks=0;
  const ctx=vm.createContext({document:doc,location:w.location,URL,crypto:{randomUUID},getComputedStyle:w.getComputedStyle.bind(w),HTMLInputElement:w.HTMLInputElement,HTMLSelectElement:w.HTMLSelectElement,Event:w.Event,KeyboardEvent:w.KeyboardEvent,MutationObserver:w.MutationObserver,setTimeout:(fn,ms)=>setTimeout(fn,ms===7000?600:ms===1000?20:ms),clearTimeout});
  const agent=vm.runInContext('('+formAgent.toString()+')',ctx);
  const list=(names,{confirm=true,parent=root,disabled=false,type='button'}={})=>{
    const menu=doc.createElement('div');menu.id='dropdown-body';menu.innerHTML='<div><div><div><div id="design-system-scroll-container"><div class="ats-mr-200"><ul class="ats-flex ats-flex-col"></ul></div></div></div></div></div>';
    for(const name of names){const li=doc.createElement('li');li.className='ats-relative ats-truncate';const b=doc.createElement('button');b.type=type;b.className='ats-truncate';b.disabled=disabled;const span=doc.createElement('span');span.textContent=name;b.append(span);li.append(b);menu.querySelector('ul').append(li);b.onclick=()=>{clicks++;if(confirm){input.value=name;category.disabled=false;kinds.forEach(b=>b.disabled=false);menu.remove();}};}
    parent.append(menu);return menu;
  };
  const scan=()=>agent('scan'),start=(s=scan(),value='모아공학과')=>agent('search-open',{scanId:s.scanId,id:s.controls.find(c=>c.autoMajor)?.id,value});
  return {w,doc,input,category,root,kinds,agent,ctx,scan,start,list,get clicks(){return clicks;}};
}

test('학교와 전공을 함께 펼친 팝업에서 중간 배치와 필수 표시가 달라도 학교부터 두 검색을 완료한다',async()=>{
  for(const layout of ['base','wrappers','required']){
    const f=fixture(),w=new Window(),calls=[];try{
      const schoolRow=f.doc.createElement('section');schoolRow.innerHTML='<div><div class="ats-inline-flex ats-flex-col ats-relative ats-group"><div><div><div><input placeholder="학교명을 검색해주세요."></div></div></div></div></div><div class="ats-inline-flex ats-flex-col ats-relative ats-group"><button type="button" disabled>학교 소재지를 선택해주세요.</button></div>';
      f.doc.querySelector('form').prepend(schoolRow);
      const school=schoolRow.querySelector('input'),region=schoolRow.querySelector('button'),schoolRoot=school.closest('.ats-inline-flex');
      const wrap=(node,count)=>{for(let i=0;i<count;i++){const div=f.doc.createElement('div');node.before(div);div.append(node);node=div;}};
      if(layout==='wrappers'){wrap(schoolRoot,4);wrap(f.root,6);}
      if(layout==='required'){region.textContent='* 학교 소재지를 선택해주세요.';f.category.textContent='전공계열을 선택해주세요. *';}
      school.oninput=()=>{const menu=f.list(['시험대학교'],{parent:schoolRoot,confirm:false});menu.querySelector('button').onclick=()=>{school.value='시험대학교';region.disabled=false;menu.remove();};};
      f.input.oninput=()=>f.list(['경영정보(MIS)']);
      w.document.write(readFileSync(new URL('../extension/popup.html',import.meta.url),'utf8'));
      const sections=[{key:'educations',label:'학력',records:[{id:'one',title:'시험 학력',fields:[{key:'schoolName',label:'학교 이름',value:'시험대학교'},{key:'major',label:'주전공',value:'경영정보'}]}]}];
      const chrome={runtime:{sendMessage:async m=>m.type==='autofill-status'?{ok:true,connected:true,server:'http://127.0.0.1:4318'}:{ok:true,sections}},tabs:{query:async()=>[{id:1,url:f.w.location.href}]},scripting:{executeScript:async({args})=>{calls.push(args[0]);return [{result:await f.agent(...args)}];}}};
      const source=readFileSync(new URL('../extension/popup.js',import.meta.url),'utf8').replace(/^import .*\r?\n/,'');
      vm.runInNewContext(source,{document:w.document,chrome,allowedPage,formAgent,automaticPlan,educationFamily,setTimeout,navigator:{clipboard:{writeText:async()=>{}}}});
      await new Promise(r=>setImmediate(r));await w.document.querySelector('#load').onclick();await w.document.querySelector('#scan').onclick();
      assert.match(w.document.querySelector('#fill').textContent,/2개 입력/,layout);
      await w.document.querySelector('#fill').onclick();
      assert.deepEqual(calls,['scan','search-open','scan','search-open','scan'],layout);
      assert.equal(school.value,'시험대학교');assert.equal(f.input.value,'경영정보(MIS)');assert.match(w.document.querySelector('#result').textContent,/2개 입력 · 0개 건너뜀/);
    }finally{await f.w.happyDOM.close();await w.happyDOM.close();}
  }
});

test('전공 결과가 짧아 스크롤 여백이나 스크롤 상자가 없어도 같은 결과 행을 선택한다',async()=>{
  for(const layout of ['no-margin','different-margin','no-scroll-wrapper']){
    const f=fixture();try{
      f.input.oninput=()=>{
        const menu=f.list(['경영정보(MIS)']);
        if(layout==='no-scroll-wrapper')menu.replaceChildren(menu.querySelector('ul'));
        else menu.querySelector('.ats-mr-200').className=layout==='no-margin'?'':'ats-mr-0';
      };
      assert.equal((await f.start(f.scan(),'경영정보')).selected,true,layout);assert.equal(f.clicks,1);
    }finally{await f.w.happyDOM.close();}
  }
});

test('경영정보와 경영정보(MIS)는 양방향 연결하고 선택된 사이트 이름으로 반영을 확인한다',async()=>{
  for(const [source,target] of [['경영정보','경영정보(MIS)'],['경영정보(MIS)','경영정보'],['경영정보','경영정보 (mis)']]){
    const f=fixture();try{
      f.input.oninput=()=>f.list([target]);const r=await f.start(f.scan(),source);
      assert.equal(r.selected,true);assert.equal(r.selectedName,target);assert.equal(f.input.value,target);assert.equal(f.clicks,1);
    }finally{await f.w.happyDOM.close();}
  }
});

test('짧은 전공 목록도 복수 목록·중첩 행·비활성·제출 버튼은 클릭하지 않는다',async()=>{
  for(const kind of ['two-menus','nested','disabled','submit']){
    const f=fixture();try{
      f.input.oninput=()=>{
        const menu=f.list(['경영정보(MIS)'],{disabled:kind==='disabled',type:kind==='submit'?'submit':'button'}),ul=menu.querySelector('ul');menu.replaceChildren(ul);
        if(kind==='two-menus')menu.append(ul.cloneNode(true));
        if(kind==='nested'){const li=ul.querySelector('li'),wrapper=f.doc.createElement('div');ul.append(wrapper);wrapper.append(li);}
      };
      assert.ok((await f.start(f.scan(),'경영정보')).error,kind);assert.equal(f.clicks,0,kind);
    }finally{await f.w.happyDOM.close();}
  }
});

test('전공 별칭보다 원문 일치를 우선하고 중복 별칭·다른 괄호·클릭 후 다른 값은 거부한다',async()=>{
  for(const kind of ['exact','duplicate','night','other-acronym','other-major','wrong-value']){
    const f=fixture();try{
      f.input.oninput=()=>{
        const names={exact:['경영정보(MIS)','경영정보'],duplicate:['경영정보(MIS)','경영정보 (MIS)'],night:['경영정보(야간)'],'other-acronym':['경영정보(BA)'],'other-major':['모아공학과(MIS)'],'wrong-value':['경영정보(MIS)']}[kind];
        const menu=f.list(names);
        if(kind==='wrong-value')menu.addEventListener('click',()=>{f.input.value='다른전공';});
      };
      const r=await f.start(f.scan(),kind==='other-major'?'모아공학과':'경영정보');
      assert.equal(Boolean(r.selected),kind==='exact',kind);assert.equal(f.clicks,['exact','wrong-value'].includes(kind)?1:0,kind);
      if(kind==='exact')assert.equal(f.input.value,'경영정보');
    }finally{await f.w.happyDOM.close();}
  }
});

test('기록된 전공 목록 구조에서 정확한 주전공 하나를 선택하고 계열 활성화를 확인한다',async()=>{
  const f=fixture();try{
    const s=f.scan();assert.ok(s.controls.find(c=>c.autoMajor));
    f.input.oninput=()=>setTimeout(()=>f.list(['다른학과','모아공학과']),20);
    const r=await f.start(s);assert.equal(r.selected,true);assert.equal(f.clicks,1);assert.equal(f.category.disabled,false);
    assert.ok(f.scan().controls.find(c=>c.autoMajor)?.filled);assert.ok((await f.start()).error);
  }finally{await f.w.happyDOM.close();}
});

test('복수전공·부전공·불명확한 구분에는 저장된 주전공을 연결하지 않는다',async()=>{
  for(const kind of ['복수전공','부전공','unknown','conflict','duplicate-row']){
    const f=fixture({kind});try{
      if(kind==='conflict'){f.kinds[0].className=on;f.kinds[0].setAttribute('aria-pressed','false');}
      if(kind==='duplicate-row'){f.kinds[0].className=on;f.doc.querySelector('section').after(f.doc.querySelector('section').cloneNode(true));}
      const s=f.scan();if(kind==='duplicate-row')assert.ok((await f.start(s)).error);else if(kind==='복수전공'){assert.equal(s.controls.find(c=>c.autoMajor)?.majorKey,'doubleMajor');assert.ok(!automaticPlan(s.controls,[{key:'major',label:'주전공',value:'시험'}]).some(c=>c.status==='ready'));}else assert.equal(s.controls.filter(c=>c.autoMajor).length,0,kind);
      assert.equal(f.clicks,0);
    }finally{await f.w.happyDOM.close();}
  }
});

test('전공 검색은 동명·부분 일치·오래된 결과·외부 목록·비활성·제출 버튼을 선택하지 않는다',async()=>{
  for(const kind of ['duplicate','partial','stale','outside','disabled','submit','two-lists']){
    const f=fixture();try{
      if(kind==='stale')f.list(['모아공학과']);
      else f.input.oninput=()=>{f.list(kind==='duplicate'?['모아공학과','모아공학과']:kind==='partial'?['모아공학과(야간)']:['모아공학과'],{parent:kind==='outside'?f.doc.body:f.root,disabled:kind==='disabled',type:kind==='submit'?'submit':'button'});if(kind==='two-lists')f.list(['모아공학과']);};
      assert.ok((await f.start()).error,kind);assert.equal(f.clicks,0,kind);
    }finally{await f.w.happyDOM.close();}
  }
});

test('전공 검색은 기존 값과 도중 수정·주전공 구분 변경·페이지 교체를 보호한다',async()=>{
  for(const kind of ['existing','query','edit','kind','navigation','replace','rescan']){
    const f=fixture({initial:['existing','query'].includes(kind)?'기존검색':'',selected:kind==='existing'});try{
      f.input.oninput=()=>{
        if(kind==='edit')f.input.value='사용자수정';
        if(kind==='kind'){f.kinds[0].className=off;f.kinds[1].className=on;}
        if(kind==='navigation')f.w.location.hash='changed';
        if(kind==='replace')f.input.replaceWith(f.input.cloneNode());
        if(kind==='rescan')f.scan();
        f.list(['모아공학과']);
      };
      assert.ok((await f.start()).error,kind);assert.equal(f.clicks,0,kind);
      if(['existing','query'].includes(kind))assert.equal(f.input.value,'기존검색');
    }finally{await f.w.happyDOM.close();}
  }
});

test('전공 결과 클릭만으로 성공 처리하지 않고 같은 검색어의 열린 결과는 재사용한다',async()=>{
  for(const kind of ['no-effect','close-only','same-query']){
    const f=fixture({initial:kind==='same-query'?'모아공학과':''});try{
      const make=()=>{const menu=f.list(['모아공학과'],{confirm:kind==='same-query'});if(kind==='close-only')menu.onclick=()=>menu.remove();};
      if(kind==='same-query')make();else f.input.oninput=make;
      assert.equal(Boolean((await f.start()).selected),kind==='same-query');assert.equal(f.clicks,1);
    }finally{await f.w.happyDOM.close();}
  }
});

test('주전공 평점과 전체 평점은 서로 다른 저장값으로 연결한다',async()=>{
  const f=fixture();try{
    f.doc.querySelector('[name*=majorGrade]').disabled=false;
    const plan=automaticPlan(f.scan().controls,[{key:'gpa',label:'전체 평점',value:'3.8'},{key:'majorGpa',label:'전공 평점',value:'4.0'}]);
    assert.equal(plan.find(c=>c.label==='평점').value,'3.8');assert.equal(plan.find(c=>c.label==='전공 평점').value,'4.0');
  }finally{await f.w.happyDOM.close();}
});

function academicControls(f,{selected=true,scaleSuccess=true,categorySuccess=true,duplicateCategory=false,categoryNames}={}){
  const grade=f.doc.querySelector('[name*=majorGrade]');grade.disabled=!selected;f.category.disabled=!selected;
  const box=f.doc.createElement('div');box.className='ats-inline-flex ats-flex-col ats-relative ats-group';box.innerHTML='<button type="button">만점 기준</button>';grade.before(box);const scale=box.querySelector('button');scale.disabled=!selected;
  const clicks=[];
  const wire=(trigger,names,confirmed,label)=>{trigger.onclick=()=>{
    const menu=f.doc.createElement('div');menu.id='dropdown-body';menu.innerHTML='<ul></ul>';
    for(const name of names){const li=f.doc.createElement('li'),b=f.doc.createElement('button');b.type='button';b.textContent=name;b.onclick=()=>{clicks.push(label);if(confirmed){trigger.textContent=name;menu.remove();}};li.append(b);menu.querySelector('ul').append(li);}trigger.parentElement.append(menu);
  };};
  wire(scale,['4.5'],scaleSuccess,'scale');wire(f.category,categoryNames??(duplicateCategory?['상경계열','상경 계열']:['상경계열']),categorySuccess,'category');
  const fields=[{key:'majorCategory',label:'주전공 계열',value:'상경계열'},{key:'majorGpa',label:'전공 평점',value:'4.19'},{key:'majorGpaScale',label:'전공 평점 만점 기준',value:'4.5'},{key:'gpa',label:'전체 평점',value:'3.6'}];
  return {grade,scale,clicks,fields};
}

test('계열 이름의 쉼표와 가운데점은 같은 구분자로 비교하고 선택된 사이트 표기를 확인한다',async()=>{
  for(const [saved,site] of [['상경계열(경영,경제)','상경계열(경영·경제)'],['상경계열(경영 · 경제)','상경계열(경영,경제)']]){
    const f=fixture();try{
      const a=academicControls(f,{categoryNames:['상경계열(회계·금융)',site,'상경계열(통계)']}),s=f.scan(),c=s.controls.find(c=>c.label==='전공계열');
      const result=await f.agent('fill',{scanId:s.scanId,entries:[{id:c.id,value:saved}]});
      assert.equal(result.results[0].ok,true,JSON.stringify(result));assert.deepEqual(a.clicks,['category']);assert.equal(f.category.textContent,site);
    }finally{await f.w.happyDOM.close();}
  }
});

test('계열 구분자만 정규화하며 다른 분야·상위 계열·구분자 없는 표현·중복 후보는 고르지 않는다',async()=>{
  for(const [saved,names] of [
    ['상경계열(경영,경제)',['상경계열(경영,경제)','상경계열(경영·경제)']],
    ['상경계열(경영,경제)',['상경계열(회계·금융)']],
    ['상경계열',['상경계열(경영·경제)']],
    ['상경계열(경영경제)',['상경계열(경영·경제)']]
  ]){
    const f=fixture();try{
      const a=academicControls(f,{categoryNames:names}),s=f.scan(),c=s.controls.find(c=>c.label==='전공계열');
      const result=await f.agent('fill',{scanId:s.scanId,entries:[{id:c.id,value:saved}]});
      assert.equal(result.results[0].ok,false);assert.equal(a.clicks.length,0);
    }finally{await f.w.happyDOM.close();}
  }
});

test('주전공 계열·만점·소수점 평점을 별도로 연결하고 만점부터 입력한다',async()=>{
  const f=fixture();try{
    const a=academicControls(f);a.grade.oninput=()=>a.clicks.push('grade');
    const scan=f.scan(),plan=automaticPlan(scan.controls,a.fields),ready=plan.filter(p=>p.status==='ready');
    assert.equal(ready.length,4);assert.equal(plan.find(p=>p.label==='전공계열').key,'majorCategory');assert.equal(plan.find(p=>p.label==='전공 만점기준').key,'majorGpaScale');
    const r=await f.agent('fill',{scanId:scan.scanId,entries:ready.map(p=>({id:p.id,value:p.value}))});
    assert.ok(r.results.every(r=>r.ok),JSON.stringify(r));assert.deepEqual(a.clicks,['scale','category','grade']);assert.equal(a.grade.value,'4.19');assert.equal(f.doc.querySelector('[name*=collegeGrade]').value,'3.6');assert.equal(f.category.textContent,'상경계열');
  }finally{await f.w.happyDOM.close();}
});

test('학과계열이나 전체 평점만으로 주전공 계열·평점을 추측하지 않는다',async()=>{
  const f=fixture();try{
    academicControls(f);
    const plan=automaticPlan(f.scan().controls,[{key:'departmentCategory',label:'학과계열',value:'공학계열'},{key:'gpa',label:'전체 평점',value:'3.8'}]);
    assert.equal(plan.find(c=>c.label==='전공계열').status,'pending');assert.equal(plan.find(c=>c.label==='전공 평점').status,'pending');
  }finally{await f.w.happyDOM.close();}
});

test('주전공 만점 선택 실패 시 해당 평점을 보류하고 전체 평점은 별도로 처리한다',async()=>{
  const f=fixture();try{
    const a=academicControls(f,{scaleSuccess:false}),s=f.scan(),ready=automaticPlan(s.controls,a.fields).filter(c=>c.status==='ready');
    const r=await f.agent('fill',{scanId:s.scanId,entries:ready.map(c=>({id:c.id,value:c.value}))});
    assert.equal(r.results.find(c=>c.label==='전공 평점').ok,false);assert.equal(a.grade.value,'');assert.equal(f.doc.querySelector('[name*=collegeGrade]').value,'3.6');
  }finally{await f.w.happyDOM.close();}
});

test('전공계열 중복 후보·클릭 미반영은 성공 처리하지 않는다',async()=>{
  for(const options of [{duplicateCategory:true},{categorySuccess:false}]){
    const f=fixture();try{
      const a=academicControls(f,options),s=f.scan(),c=s.controls.find(c=>c.label==='전공계열');
      const r=await f.agent('fill',{scanId:s.scanId,entries:[{id:c.id,value:'상경계열'}]});assert.equal(r.results[0].ok,false);assert.equal(a.clicks.length,options.duplicateCategory?0:1);
    }finally{await f.w.happyDOM.close();}
  }
});

test('주전공 구분 변경·다른 행·기존 값·비활성·성적 이름 변경·지연 비움은 보호한다',async()=>{
  for(const kind of ['changed','name','existing','disabled','clear']){
    const f=fixture();try{
      const a=academicControls(f),s=f.scan(),c=s.controls.find(c=>c.label==='전공 평점');
      if(kind==='double')assert.equal(c.unsupported,true);
      if(kind==='changed'){f.kinds[0].className=off;f.kinds[1].className=on;}
      if(kind==='name')a.grade.name='collegeGroupAnswers.0.collegeMajorList.1.majorGrade.score';
      if(kind==='existing')a.grade.value='3.3';
      if(kind==='disabled')a.grade.disabled=true;
      if(kind==='clear')a.grade.onblur=()=>setTimeout(()=>{a.grade.value='';},5);
      const r=await f.agent('fill',{scanId:s.scanId,entries:[{id:c.id,value:'4.19'}]});assert.equal(r.results[0].ok,false,kind);if(kind==='existing')assert.equal(a.grade.value,'3.3');
    }finally{await f.w.happyDOM.close();}
  }
});

test('주전공 선택 후 재인식하면 계열·만점·평점도 한 번의 팝업 입력으로 이어진다',async()=>{
  const f=fixture(),w=new Window();try{
    const a=academicControls(f,{selected:false});f.input.oninput=()=>{const menu=f.list(['경영정보(MIS)']);menu.addEventListener('click',()=>{a.grade.disabled=false;a.scale.disabled=false;});};
    w.document.write(readFileSync(new URL('../extension/popup.html',import.meta.url),'utf8'));
    const sections=[{key:'educations',label:'학력',records:[{id:'one',title:'가상 학력',fields:[...a.fields,{key:'major',label:'주전공',value:'경영정보'}]}]}];
    const chrome={runtime:{sendMessage:async m=>m.type==='autofill-status'?{ok:true,connected:true,server:'http://127.0.0.1:4318'}:{ok:true,sections}},tabs:{query:async()=>[{id:1,url:f.w.location.href}]},scripting:{executeScript:async({args})=>[{result:await f.agent(...args)}]}};
    vm.runInNewContext(readFileSync(new URL('../extension/popup.js',import.meta.url),'utf8').replace(/^import .*\r?\n/,''),{document:w.document,chrome,allowedPage,formAgent,automaticPlan,educationFamily,setTimeout,navigator:{clipboard:{writeText:async()=>{}}}});
    await new Promise(r=>setImmediate(r));await w.document.querySelector('#load').onclick();await w.document.querySelector('#scan').onclick();await w.document.querySelector('#fill').onclick();
    assert.match(w.document.querySelector('#result').textContent,/5개 입력 · 0개 건너뜀/);assert.equal(a.grade.value,'4.19');assert.equal(a.scale.textContent,'4.5');assert.equal(f.category.textContent,'상경계열');
  }finally{await f.w.happyDOM.close();await w.happyDOM.close();}
});

test('팝업의 자동 입력 버튼 한 번으로 전체 평점을 먼저 채운 뒤 주전공을 선택한다',async()=>{
  const f=fixture(),w=new Window(),calls=[];try{
    f.input.oninput=()=>f.list(['경영정보(MIS)']);w.document.write(readFileSync(new URL('../extension/popup.html',import.meta.url),'utf8'));
    const sections=[{key:'educations',label:'학력',records:[{id:'one',title:'가상 학교',fields:[{key:'major',label:'주전공',value:'경영정보'},{key:'doubleMajor',label:'복수전공',value:'다른학과'},{key:'gpa',label:'전체 평점',value:'3.8'}]}]}];
    const chrome={runtime:{sendMessage:async m=>m.type==='autofill-status'?{ok:true,connected:true,server:'http://127.0.0.1:4318'}:{ok:true,sections}},tabs:{query:async()=>[{id:1,url:f.w.location.href}]},scripting:{executeScript:async({args})=>{calls.push(args[0]);return [{result:await f.agent(...args)}];}}};
    const source=readFileSync(new URL('../extension/popup.js',import.meta.url),'utf8').replace(/^import .*\r?\n/,'');
    vm.runInNewContext(source,{document:w.document,chrome,allowedPage,formAgent,automaticPlan,educationFamily,setTimeout,navigator:{clipboard:{writeText:async()=>{}}}});
    await new Promise(r=>setImmediate(r));await w.document.querySelector('#load').onclick();await w.document.querySelector('#scan').onclick();
    assert.equal(w.document.querySelectorAll('#preview select').length,0);assert.match(w.document.querySelector('#preview').textContent,/경영정보/);assert.match(w.document.querySelector('#fill').textContent,/2개 입력/);
    await w.document.querySelector('#fill').onclick();assert.deepEqual(calls,['scan','fill','scan','search-open','scan']);assert.equal(f.input.value,'경영정보(MIS)');assert.match(w.document.querySelector('#fill-results').textContent,/주전공: 입력됨 · 경영정보\(MIS\)/);assert.equal(f.doc.querySelector('[name*=collegeGrade]').value,'3.8');
  }finally{await f.w.happyDOM.close();await w.happyDOM.close();}
});


test('두 미선택 주전공 줄은 원인을 알리고 다른 학력 입력 후에도 누락 이유를 남긴다',async()=>{
  const f=fixture(),w=new Window(),calls=[];try{
    const row=f.doc.querySelector('section').cloneNode(true);
    row.querySelector('[name*=majorGrade]').name='collegeGroupAnswers.0.collegeMajorList.1.majorGrade.score';
    f.doc.querySelector('form').append(row);
    const credits=f.doc.createElement('input');credits.placeholder='총 이수학점';f.doc.querySelector('form').append(credits);
    w.document.write(readFileSync(new URL('../extension/popup.html',import.meta.url),'utf8'));
    const fields=[{key:'major',label:'주전공',value:'시험전공'}];
    const sections=[{key:'educations',label:'학력',records:[{id:'one',title:'시험 학력',fields}]}];
    const chrome={runtime:{sendMessage:async m=>m.type==='autofill-status'?{ok:true,connected:true,server:'http://127.0.0.1:4318'}:{ok:true,sections}},tabs:{query:async()=>[{id:1,url:f.w.location.href}]},scripting:{executeScript:async({args})=>{calls.push(args[0]);return [{result:await f.agent(...args)}];}}};
    const source=readFileSync(new URL('../extension/popup.js',import.meta.url),'utf8').replace(/^import .*\r?\n/,'');
    vm.runInNewContext(source,{document:w.document,chrome,allowedPage,formAgent,automaticPlan,educationFamily,setTimeout,navigator:{clipboard:{writeText:async()=>{}}}});
    await new Promise(r=>setImmediate(r));await w.document.querySelector('#load').onclick();await w.document.querySelector('#scan').onclick();
    assert.equal(w.document.querySelector('#fill').disabled,true);
    assert.match(w.document.querySelector('#result').textContent,/미선택 전공 줄이 2개/);
    assert.match(w.document.querySelector('#preview').textContent,/각 전공 한 줄만/);
    fields.push({key:'totalCredits',label:'총 이수 학점',value:'120'});
    await w.document.querySelector('#scan').onclick();
    assert.equal(w.document.querySelector('#fill').disabled,false);
    await w.document.querySelector('#fill').onclick();
    assert.equal(credits.value,'120');
    assert.match(w.document.querySelector('#fill-results').textContent,/주전공: .*미선택 전공 줄이 2개/);
    assert.match(w.document.querySelector('#result').textContent,/1개 입력 · 1개 건너뜀/);
    assert.ok(!calls.includes('search-open'));
    assert.equal(f.input.value,'');assert.equal(row.querySelector('input').value,'');
    row.remove();await w.document.querySelector('#scan').onclick();
    assert.match(w.document.querySelector('#fill').textContent,/1개 입력/);
    assert.doesNotMatch(w.document.querySelector('#result').textContent,/미선택 전공 줄이 2개/);
  }finally{await f.w.happyDOM.close();await w.happyDOM.close();}
});


function doubleFixture({kind='주전공',college=0,primaryName='경영정보(MIS)',switchKind=true,scaleSuccess=true}={}){
  const f=fixture({initial:primaryName,selected:true}),a=academicControls(f);
  a.grade.value='4.1';a.scale.textContent='4.5';f.category.textContent='상경계열';
  const row=f.doc.querySelector('section').cloneNode(true);f.doc.querySelector('form').append(row);
  const input=row.querySelector('input[type=text],input:not([type])'),grade=row.querySelector('[name*=majorGrade]'),category=row.querySelector('#category');
  input.value='';grade.value='';grade.disabled=true;grade.name='collegeGroupAnswers.'+college+'.collegeMajorList.1.majorGrade.score';
  category.id='second-category';category.textContent='전공계열을 선택해주세요.';category.disabled=true;
  const root=input.closest('.ats-inline-flex'),kinds=[...row.querySelectorAll('li button')],scale=[...row.querySelectorAll('button')].find(b=>b.textContent==='4.5');
  scale.textContent='만점 기준';scale.disabled=true;const calls=[];
  kinds.forEach(b=>{b.className=b.textContent===kind?on:off;b.disabled=true;b.onclick=()=>{calls.push('kind:'+b.textContent);if(switchKind)kinds.forEach(x=>x.className=x===b?on:off);};});
  input.oninput=()=>{calls.push('search');const menu=f.list(['시험통계학과'],{parent:root,confirm:false});menu.querySelector('button').onclick=()=>{calls.push('select');input.value='시험통계학과';category.disabled=false;grade.disabled=false;scale.disabled=false;kinds.forEach(b=>b.disabled=false);menu.remove();};};
  const wire=(button,label,value,success=true)=>{button.onclick=()=>{const menu=f.doc.createElement('div');menu.id='dropdown-body';menu.innerHTML='<ul><li><button type="button"></button></li></ul>';const option=menu.querySelector('button');option.textContent=value;option.onclick=()=>{calls.push(label);if(success){button.textContent=value;menu.remove();}};button.parentElement.append(menu);};};
  wire(category,'category','상경계열(통계)');wire(scale,'scale','4.5',scaleSuccess);grade.oninput=()=>calls.push('grade');
  const fields=[{key:'major',label:'주전공',value:'경영정보'},{key:'majorGpa',label:'전공 평점',value:'4.1'},{key:'doubleMajor',label:'복수전공',value:'시험통계학과'},{key:'doubleMajorCategory',label:'복수전공 계열',value:'상경계열(통계)'},{key:'doubleMajorGpa',label:'복수전공 평점',value:'3.75'},{key:'doubleMajorGpaScale',label:'복수전공 평점 만점 기준',value:'4.5'}];
  const scan=()=>f.agent('scan',{primaryMajor:'경영정보',doubleMajor:'시험통계학과'});
  return {f,a,row,input,grade,category,scale,kinds,calls,fields,scan};
}
async function popupFor(f,fields){
  const w=new Window();w.document.write(readFileSync(new URL('../extension/popup.html',import.meta.url),'utf8'));
  const sections=[{key:'educations',label:'학력',records:[{id:'one',title:'시험 학력',fields}]}];
  const chrome={runtime:{sendMessage:async m=>m.type==='autofill-status'?{ok:true,connected:true,server:'http://127.0.0.1:4318'}:{ok:true,sections}},tabs:{query:async()=>[{id:1,url:f.w.location.href}]},scripting:{executeScript:async({args})=>[{result:await f.agent(...args)}]}};
  vm.runInNewContext(readFileSync(new URL('../extension/popup.js',import.meta.url),'utf8').replace(/^import .*\r?\n/,''),{document:w.document,chrome,allowedPage,formAgent,automaticPlan,educationFamily,setTimeout,navigator:{clipboard:{writeText:async()=>{}}}});
  await new Promise(r=>setImmediate(r));await w.document.querySelector('#load').onclick();await w.document.querySelector('#scan').onclick();return w;
}

test('이미 입력한 주전공 옆의 새 기본 행을 복전으로 검색·전환하고 복전 계열·만점·평점까지 채운다',async()=>{
  const d=doubleFixture(),w=await popupFor(d.f,d.fields);try{
    const before=d.f.doc.querySelector('section').outerHTML;
    assert.match(w.document.querySelector('#preview').textContent,/복수전공시험통계학과/);
    await w.document.querySelector('#fill').onclick();
    assert.equal(d.input.value,'시험통계학과');assert.equal(d.kinds.find(b=>b.className===on).textContent,'복수전공');
    assert.equal(d.category.textContent,'상경계열(통계)');assert.equal(d.scale.textContent,'4.5');assert.equal(d.grade.value,'3.75');
    assert.deepEqual(d.calls,['search','select','kind:복수전공','category','scale','grade']);
    assert.equal(d.f.doc.querySelector('section').outerHTML,before);assert.equal(d.a.grade.value,'4.1');
    assert.match(w.document.querySelector('#result').textContent,/4개 입력 · 0개 건너뜀/);
    await w.document.querySelector('#scan').onclick();assert.equal(w.document.querySelector('#fill').disabled,true);
  }finally{await d.f.w.happyDOM.close();await w.happyDOM.close();}
});

test('이미 복수전공으로 지정된 행은 복전값으로 연결하고 주전공값은 사용하지 않는다',async()=>{
  const d=doubleFixture({kind:'복수전공'}),w=await popupFor(d.f,d.fields);try{
    await w.document.querySelector('#fill').onclick();assert.equal(d.input.value,'시험통계학과');assert.equal(d.grade.value,'3.75');
    assert.ok(!d.calls.includes('kind:복수전공'));assert.equal(d.a.grade.value,'4.1');
  }finally{await d.f.w.happyDOM.close();await w.happyDOM.close();}
});

test('주전공 불일치·다른 대학·복전값 누락·중복 빈 행은 복전 대상으로 임의 지정하지 않는다',async()=>{
  for(const mode of ['wrong-primary','other-college','missing','duplicate']){
    const d=doubleFixture({primaryName:mode==='wrong-primary'?'다른전공':'경영정보(MIS)',college:mode==='other-college'?1:0});
    if(mode==='missing')d.fields=d.fields.filter(f=>f.key!=='doubleMajor');
    if(mode==='duplicate'){const clone=d.row.cloneNode(true);clone.querySelector('[name*=majorGrade]').name='collegeGroupAnswers.0.collegeMajorList.2.majorGrade.score';d.row.after(clone);}
    const w=await popupFor(d.f,d.fields);try{
      if(mode!=='other-college')assert.equal(w.document.querySelector('#fill').disabled,true,mode);
      else assert.doesNotMatch(w.document.querySelector('#preview').textContent,/복수전공시험통계학과/);
      assert.equal(d.calls.length,0,mode);
    }finally{await d.f.w.happyDOM.close();await w.happyDOM.close();}
  }
});

test('미리보기 후 주전공 변경 또는 복전 구분 클릭 미반영은 성공 처리하지 않는다',async()=>{
  for(const mode of ['primary-changed','kind-no-effect']){
    const d=doubleFixture({switchKind:mode!=='kind-no-effect'});try{
      const s=d.scan(),c=s.controls.find(c=>c.majorKey==='doubleMajor'&&!c.filled);assert.ok(c);
      if(mode==='primary-changed')d.f.input.value='바뀐주전공';
      const r=await d.f.agent('search-open',{scanId:s.scanId,id:c.id,value:'시험통계학과'});
      assert.ok(r.error,mode);assert.equal(d.grade.value,'');
      if(mode==='primary-changed')assert.equal(d.calls.length,0);else assert.equal(d.calls.filter(c=>c==='kind:복수전공').length,1);
    }finally{await d.f.w.happyDOM.close();}
  }
});

test('복전 만점 선택 실패는 복전 평점만 보류하며 주전공 평점은 별도로 채운다',async()=>{
  const d=doubleFixture({kind:'복수전공',scaleSuccess:false});d.a.grade.value='';
  const w=await popupFor(d.f,d.fields);try{
    await w.document.querySelector('#fill').onclick();assert.equal(d.grade.value,'');assert.equal(d.a.grade.value,'4.1');
    assert.match(w.document.querySelector('#fill-results').textContent,/복수전공 평점: 만점 기준 선택을 확인하지 못해/);
  }finally{await d.f.w.happyDOM.close();await w.happyDOM.close();}
});


function emptyPairFixture(){
  const d=doubleFixture();d.f.input.value='';d.f.category.textContent='전공계열을 선택해주세요.';d.f.category.disabled=true;
  d.a.grade.value='';d.a.grade.disabled=true;d.a.scale.textContent='만점 기준';d.a.scale.disabled=true;d.f.kinds.forEach(b=>b.disabled=true);
  d.f.input.oninput=()=>{const menu=d.f.list(['경영정보(MIS)']);menu.addEventListener('click',()=>{d.a.grade.disabled=false;d.a.scale.disabled=false;});};
  d.fields.push({key:'majorCategory',label:'주전공 계열',value:'상경계열'},{key:'majorGpaScale',label:'전공 평점 만점 기준',value:'4.5'});
  return d;
}

test('빈 기본 전공 두 줄을 첫째 주전공·둘째 복전으로 미리보기하고 한 번에 각각 채운다',async()=>{
  const d=emptyPairFixture(),w=await popupFor(d.f,d.fields);try{
    const preview=w.document.querySelector('#preview').textContent;
    assert.match(preview,/첫 번째 전공 줄 → 주전공/);assert.match(preview,/두 번째 전공 줄 → 복수전공/);
    assert.match(w.document.querySelector('#fill').textContent,/2개 입력/);
    await w.document.querySelector('#fill').onclick();
    assert.equal(d.f.input.value,'경영정보(MIS)');assert.equal(d.input.value,'시험통계학과');
    assert.equal(d.f.kinds.find(b=>b.className===on).textContent,'주전공');assert.equal(d.kinds.find(b=>b.className===on).textContent,'복수전공');
    assert.equal(d.f.category.textContent,'상경계열');assert.equal(d.category.textContent,'상경계열(통계)');
    assert.equal(d.a.grade.value,'4.1');assert.equal(d.grade.value,'3.75');assert.equal(d.a.scale.textContent,'4.5');assert.equal(d.scale.textContent,'4.5');
    assert.match(w.document.querySelector('#result').textContent,/8개 입력 · 0개 건너뜀/);
    await w.document.querySelector('#scan').onclick();assert.equal(w.document.querySelector('#fill').disabled,true);
  }finally{await d.f.w.happyDOM.close();await w.happyDOM.close();}
});

test('두 빈 전공 줄이라도 저장명 누락·동일명·타 대학·중복 식별자·기존 검색어·추가 행은 순서로 배정하지 않는다',async()=>{
  for(const mode of ['missing-primary','missing-double','same-name','other-college','duplicate-scope','typed','grade','other-form','third-row']){
    const d=emptyPairFixture();try{
      const profile={primaryMajor:'경영정보',doubleMajor:'시험통계학과'};
      if(mode==='missing-primary')profile.primaryMajor='';if(mode==='missing-double')profile.doubleMajor='';if(mode==='same-name')profile.doubleMajor='경영정보(MIS)';
      if(mode==='other-college')d.grade.name='collegeGroupAnswers.1.collegeMajorList.1.majorGrade.score';
      if(mode==='duplicate-scope')d.grade.name=d.a.grade.name;
      if(mode==='typed')d.input.value='사용자검색';
      if(mode==='grade')d.grade.value='3.2';
      if(mode==='other-form'){const form=d.f.doc.createElement('form');d.f.doc.body.append(form);form.append(d.row);}
      if(mode==='third-row'){const extra=d.row.cloneNode(true);extra.querySelector('[name*=majorGrade]').name='collegeGroupAnswers.0.collegeMajorList.2.majorGrade.score';d.row.after(extra);}
      const s=d.f.agent('scan',profile);assert.ok(!s.controls.some(c=>c.planNote),mode);assert.equal(d.calls.length,0,mode);
    }finally{await d.f.w.happyDOM.close();}
  }
});

test('두 줄 계획은 복전 선행 실행 및 미리보기 이후 순서·이름·행 수 변경을 거부한다',async()=>{
  for(const mode of ['double-first','reorder','typed','third-row','during-search']){
    const d=emptyPairFixture();try{
      const s=d.scan(),c=s.controls.find(c=>c.majorKey===(mode==='double-first'?'doubleMajor':'major')&&!c.filled);assert.ok(c);
      if(mode==='reorder')d.f.doc.querySelector('form').prepend(d.row);
      if(mode==='typed')d.input.value='사용자입력';
      if(mode==='third-row')d.row.after(d.row.cloneNode(true));
      if(mode==='during-search')d.f.input.oninput=()=>{d.input.value='사용자입력';d.f.list(['경영정보(MIS)']);};
      const r=await d.f.agent('search-open',{scanId:s.scanId,id:c.id,value:mode==='double-first'?'시험통계학과':'경영정보'});
      assert.ok(r.error,mode);assert.equal(d.f.clicks,0,mode);assert.equal(d.calls.length,0,mode);
    }finally{await d.f.w.happyDOM.close();}
  }
});

test('두 줄 실행에서 주전공 검색 실패 시 복전 검색과 성적 입력을 시작하지 않는다',async()=>{
  const d=emptyPairFixture();d.f.input.oninput=()=>d.f.list(['경영정보(MIS)'],{confirm:false});
  const w=await popupFor(d.f,d.fields);try{
    await w.document.querySelector('#fill').onclick();assert.equal(d.input.value,'');assert.equal(d.grade.value,'');assert.equal(d.a.grade.value,'');assert.equal(d.calls.length,0);
    assert.equal(w.document.querySelector('#result').dataset.error,'true');
  }finally{await d.f.w.happyDOM.close();await w.happyDOM.close();}
});


test('주전공 선택 뒤 학적 칸 활성화가 늦어도 미리본 복전 검색을 빠뜨리지 않는다',async()=>{
  const d=emptyPairFixture();d.f.input.oninput=()=>{
    const menu=d.f.list(['경영정보(MIS)']);menu.addEventListener('click',()=>setTimeout(()=>{d.a.grade.disabled=false;d.a.scale.disabled=false;},350));
  };
  const w=await popupFor(d.f,d.fields);try{
    assert.match(w.document.querySelector('#preview').textContent,/두 번째 전공 줄 → 복수전공/);
    await w.document.querySelector('#fill').onclick();
    assert.equal(d.input.value,'시험통계학과');assert.equal(d.grade.value,'3.75');
    assert.equal(d.a.grade.value,'4.1');assert.equal(d.a.scale.textContent,'4.5');
    assert.match(w.document.querySelector('#fill-results').textContent,/복수전공: 입력됨/);
  }finally{await d.f.w.happyDOM.close();await w.happyDOM.close();}
});

test('학교 전체를 마친 뒤 주전공 전체와 복전 전체를 순서대로 입력하고 재입력하지 않는다',async()=>{
  const d=emptyPairFixture(),f=d.f,events=[];let w;
  try{
    const schoolRow=f.doc.createElement('section');schoolRow.innerHTML='<div><div class="ats-inline-flex ats-flex-col ats-relative ats-group"><div><div><div><input placeholder="학교명을 검색해주세요."></div></div></div></div></div><div class="ats-inline-flex ats-flex-col ats-relative ats-group"><button type="button" disabled>학교 소재지를 선택해주세요.</button></div>';
    f.doc.querySelector('form').prepend(schoolRow);
    const school=schoolRow.querySelector('input'),region=schoolRow.querySelector('button'),schoolRoot=school.closest('.ats-inline-flex');
    school.oninput=()=>{events.push('school-search');const menu=f.list(['시험대학교'],{parent:schoolRoot,confirm:false});menu.querySelector('button').onclick=()=>{events.push('school-selected');school.value='시험대학교';region.disabled=false;menu.remove();};};
    const wire=(button,value,event)=>{button.onclick=()=>{const menu=f.list([value],{parent:button.parentElement,confirm:false});menu.querySelector('button').onclick=()=>{events.push(event);button.textContent=value;menu.remove();};};};
    wire(region,'서울','region');
    for(const [label,value,key,event] of [['입학일','2022-03','startMonth','start'],['졸업일','2026-08','endMonth','end'],['총 이수학점 *','144','totalCredits','credits']]){
      const input=f.doc.createElement('input');input.setAttribute('aria-label',label);input.type=key==='totalCredits'?'number':'month';input.oninput=()=>events.push(event);schoolRow.append(input);d.fields.push({key,label,value});
    }
    for(const [label,values,key,value,event] of [['졸업구분',['졸업','수료'],'status','수료','status'],['입학구분',['입학','편입'],'admissionType','입학','admission']]){
      const group=f.doc.createElement('div');group.innerHTML='<span>'+label+'</span><div><div>'+values.map(v=>'<li class="ats-list-none"><button type="button" aria-pressed="false">'+v+'</button></li>').join('')+'</div></div>';
      const buttons=[...group.querySelectorAll('button')];buttons.forEach(b=>b.onclick=()=>{events.push(event);buttons.forEach(x=>x.setAttribute('aria-pressed',String(x===b)));});schoolRow.append(group);d.fields.push({key,label,value});
    }
    for(const [text,key,value,event] of [['학과계열을 선택해주세요.','departmentCategory','상경계열','department'],['만점 기준','gpaScale','4.5','school-scale']]){
      const box=f.doc.createElement('div');box.className='ats-inline-flex ats-flex-col ats-relative ats-group';box.innerHTML='<button type="button">'+text+'</button>';schoolRow.append(box);wire(box.firstChild,value,event);d.fields.push({key,label:key==='gpaScale'?'평점 만점 기준':'학과계열',value});
    }
    const overall=f.doc.querySelector('[name*=collegeGrade]');schoolRow.append(overall);overall.oninput=()=>events.push('school-grade');
    d.fields.push({key:'schoolName',label:'학교 이름',value:'시험대학교'},{key:'location',label:'소재지',value:'서울'},{key:'gpa',label:'전체 평점',value:'3.8'});
    const primaryInput=f.input.oninput;f.input.oninput=()=>{events.push('primary-search');primaryInput();};
    d.a.clicks.push=(value)=>events.push('primary-'+value);d.a.grade.oninput=()=>events.push('primary-grade');
    d.calls.push=(value)=>events.push('double-'+value);
    w=await popupFor(f,d.fields);await w.document.querySelector('#fill').onclick();
    assert.deepEqual(events,['school-search','school-selected','region','start','end','status','admission','department','school-scale','school-grade','credits','primary-search','primary-category','primary-scale','primary-grade','double-search','double-select','double-kind:복수전공','double-category','double-scale','double-grade']);
    assert.equal(overall.value,'3.8');assert.equal(d.a.grade.value,'4.1');assert.equal(d.grade.value,'3.75');
    assert.match(w.document.querySelector('#result').textContent,/18개 입력 · 0개 건너뜀/);
    const count=events.length;await w.document.querySelector('#scan').onclick();assert.equal(w.document.querySelector('#fill').disabled,true);assert.equal(events.length,count);
    overall.value='';d.a.grade.value='';d.grade.value='';
    await w.document.querySelector('#scan').onclick();await w.document.querySelector('#fill').onclick();
    assert.deepEqual(events.slice(count),['school-grade','primary-grade','double-grade']);
    assert.match(w.document.querySelector('#result').textContent,/3개 입력 · 0개 건너뜀/);
  }finally{await f.w.happyDOM.close();await w?.happyDOM.close();}
});


test('미리본 복전이 끝내 준비되지 않으면 주전공 성공과 복전 검색 전 중단을 함께 표시한다',async()=>{
  const d=emptyPairFixture();d.f.input.oninput=()=>d.f.list(['경영정보(MIS)']);
  const w=await popupFor(d.f,d.fields);try{
    await w.document.querySelector('#fill').onclick();
    assert.equal(d.f.input.value,'경영정보(MIS)');assert.equal(d.input.value,'');assert.equal(d.calls.length,0);
    assert.equal(w.document.querySelector('#result').dataset.error,'true');
    assert.match(w.document.querySelector('#fill-results').textContent,/주전공: 선택 확인됨/);
    assert.match(w.document.querySelector('#fill-results').textContent,/복수전공: .*검색 전 중단/);
    assert.doesNotMatch(w.document.querySelector('#result').textContent,/0개 건너뜀/);
  }finally{await d.f.w.happyDOM.close();await w.happyDOM.close();}
});

test('재인식한 복전이 미리본 행과 다른 식별자이면 새 행에 검색하지 않는다',async()=>{
  const d=emptyPairFixture(),agent=d.f.agent;let scans=0;
  d.f.agent=(action,payload)=>{if(action==='scan'&&++scans===2)d.grade.name='collegeGroupAnswers.0.collegeMajorList.8.majorGrade.score';return agent(action,payload);};
  const w=await popupFor(d.f,d.fields);try{
    await w.document.querySelector('#fill').onclick();assert.equal(d.input.value,'');assert.equal(d.calls.length,0);
    assert.match(w.document.querySelector('#fill-results').textContent,/복수전공: .*다른 전공 줄/);
    assert.equal(w.document.querySelector('#result').dataset.error,'true');
  }finally{await d.f.w.happyDOM.close();await w.happyDOM.close();}
});

test('복전 준비를 기다리던 중 다른 탭으로 이동하면 검색을 이어가지 않는다',async()=>{
  const d=emptyPairFixture();d.f.input.oninput=()=>{const menu=d.f.list(['경영정보(MIS)']);menu.addEventListener('click',()=>setTimeout(()=>{d.f.w.location.hash='changed';},70));};
  const w=await popupFor(d.f,d.fields);try{
    await w.document.querySelector('#fill').onclick();assert.equal(d.calls.length,0);assert.equal(d.input.value,'');
    assert.match(w.document.querySelector('#result').textContent,/페이지가 바뀌었어요/);assert.equal(w.document.querySelector('#result').dataset.error,'true');
  }finally{await d.f.w.happyDOM.close();await w.happyDOM.close();}
});


test('선택 후 안내가 사라진 주전공과 빈 복전 행을 값 없이 각각 진단한다',async()=>{
  const d=doubleFixture();try{
    d.f.input.removeAttribute('placeholder');
    const secret=d.f.doc.createElement('span');secret.textContent='PRIVATE_MAJOR_NAME';d.f.input.after(secret);
    d.f.input.value='PRIVATE_MAJOR_INPUT';d.a.grade.value='3.987654';
    const r=d.f.agent('diagnose');assert.equal(r.majorStructures.length,2);
    assert.equal(r.majorStructures[0].kind,'주전공');assert.equal(r.majorStructures[0].gradeDisabled,false);assert.equal(r.majorStructures[1].gradeDisabled,true);
    assert.equal(r.majorStructures[0].nameInputCandidates,1);
    assert.ok(r.majorStructures[0].nodes.some(n=>n.tag==='input'&&n.name.includes('majorGrade')));
    assert.ok(!JSON.stringify(r).includes('PRIVATE_MAJOR'));assert.ok(!JSON.stringify(r).includes('3.987654'));
    d.f.input.remove();const next=d.f.agent('diagnose');assert.equal(next.majorStructures[0].nameInputCandidates,0);
    assert.equal(d.a.grade.value,'3.987654');assert.equal(d.input.value,'');assert.equal(d.calls.length,0);
  }finally{await d.f.w.happyDOM.close();}
});


// f08dc58d: ATS replaces the input component with an erpqz7x0 name chip.
// Names here are synthetic; diagnostic values are not stored in this fixture.
function selectedChip(f,input,name){
  const root=input.closest('.ats-inline-flex'),slot=root.parentElement;
  slot.classList.add('e1kw1b6c0');const chip=f.doc.createElement('div');chip.className='css-16pe erpqz7x0';
  const label=f.doc.createElement('p');label.className='ats-font-medium ats-text-[14px] ats-leading-[20px]';label.textContent=name;
  chip.append(label,f.doc.createElementNS('http://www.w3.org/2000/svg','svg'));root.replaceWith(chip);return {chip,label,slot};
}

test('진단 f08dc58d처럼 주전공 입력칸이 이름 표시로 바뀌어도 빈 복전을 연결하고 선택한다',async()=>{
  const d=doubleFixture();selectedChip(d.f,d.f.input,'경영정보(MIS)');
  const w=await popupFor(d.f,d.fields);try{
    assert.match(w.document.querySelector('#preview').textContent,/복수전공시험통계학과/);
    await w.document.querySelector('#fill').onclick();
    assert.equal(d.input.value,'시험통계학과');assert.equal(d.grade.value,'3.75');assert.equal(d.a.grade.value,'4.1');
  }finally{await d.f.w.happyDOM.close();await w.happyDOM.close();}
});


test('주전공과 복전을 선택할 때마다 입력칸이 표시용 글자로 교체돼도 끝까지 입력한다',async()=>{
  const d=emptyPairFixture();let primaryChip,doubleChip;
  const primaryInput=d.f.input.oninput;d.f.input.oninput=()=>{primaryInput();d.f.root.querySelector('#dropdown-body').addEventListener('click',()=>{primaryChip=selectedChip(d.f,d.f.input,'경영정보(MIS)');});};
  const doubleInput=d.input.oninput;d.input.oninput=()=>{doubleInput();d.input.closest('.ats-inline-flex').querySelector('#dropdown-body').addEventListener('click',()=>{doubleChip=selectedChip(d.f,d.input,'시험통계학과');});};
  const w=await popupFor(d.f,d.fields);try{
    await w.document.querySelector('#fill').onclick();
    assert.equal(primaryChip.label.textContent,'경영정보(MIS)');assert.equal(doubleChip.label.textContent,'시험통계학과');
    assert.equal(d.f.input.isConnected,false);assert.equal(d.input.isConnected,false);
    assert.equal(d.kinds.find(b=>b.className===on).textContent,'복수전공');
    assert.equal(d.a.grade.value,'4.1');assert.equal(d.grade.value,'3.75');
    assert.equal(d.f.category.textContent,'상경계열');assert.equal(d.category.textContent,'상경계열(통계)');
    assert.match(w.document.querySelector('#result').textContent,/8개 입력 · 0개 건너뜀/);
    await w.document.querySelector('#scan').onclick();assert.equal(w.document.querySelector('#fill').disabled,true);
  }finally{await d.f.w.happyDOM.close();await w.happyDOM.close();}
});

test('선택된 주전공 표시의 동명 중복·다른 이름·숨김·알 수 없는 모양은 복전 연결 근거로 쓰지 않는다',async()=>{
  for(const mode of ['duplicate','wrong','hidden','unknown','outside','also-input']){
    const d=doubleFixture(),selected=selectedChip(d.f,d.f.input,mode==='wrong'?'다른전공':'경영정보(MIS)');try{
      if(mode==='duplicate')selected.chip.after(selected.chip.cloneNode(true));
      if(mode==='hidden')selected.chip.hidden=true;
      if(mode==='unknown')selected.chip.className='unknown-chip';
      if(mode==='outside')d.f.doc.body.append(selected.chip);
      if(mode==='also-input'){const extra=d.f.doc.createElement('div');extra.className='ats-inline-flex ats-flex-col ats-relative ats-group';extra.innerHTML='<input type="text">';extra.querySelector('input').value='경영정보(MIS)';selected.chip.after(extra);}
      const s=d.scan();assert.ok(!s.controls.some(c=>c.autoMajor&&c.majorKey==='doubleMajor'),mode);assert.equal(d.calls.length,0);
    }finally{await d.f.w.happyDOM.close();}
  }
});

test('복전 선택 중 기존 주전공 글자가 바뀌면 중단하고 표시용 이름은 진단에 노출하지 않는다',async()=>{
  const d=doubleFixture(),selected=selectedChip(d.f,d.f.input,'경영정보(MIS)');try{
    const s=d.scan(),c=s.controls.find(c=>c.majorKey==='doubleMajor');assert.ok(c);
    const original=d.input.oninput;d.input.oninput=()=>{selected.label.textContent='PRIVATE_CHANGED_NAME';original();};
    const r=await d.f.agent('search-open',{scanId:s.scanId,id:c.id,value:'시험통계학과'});assert.ok(r.error);
    assert.ok(!d.calls.includes('select'));assert.ok(!JSON.stringify(d.f.agent('diagnose')).includes('PRIVATE_CHANGED_NAME'));
  }finally{await d.f.w.happyDOM.close();}
});

test('선택 직후 다른 전공 이름 표시 또는 다른 영역 교체는 성공으로 처리하지 않는다',async()=>{
  for(const mode of ['wrong','wrong-slot']){
    const f=fixture();try{
      f.root.parentElement.classList.add('e1kw1b6c0');
      f.input.oninput=()=>{const menu=f.list(['모아공학과']);menu.addEventListener('click',()=>{
        const selected=selectedChip(f,f.input,mode==='wrong'?'다른공학과':'모아공학과');
        if(mode==='wrong-slot'){const holder=f.doc.createElement('div');holder.className='e1kw1b6c0';selected.slot.after(holder);holder.append(selected.chip);}
      });};
      const r=await f.start();assert.ok(r.error,mode);
    }finally{await f.w.happyDOM.close();}
  }
});
