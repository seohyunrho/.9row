import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Window} from 'happy-dom';
import vm from 'node:vm';
import {allowedPage,formAgent,automaticPlan,educationFamily} from '../extension/autofill-core.js';

test('졸업에서 수료로 변경됨을 표시하고 한 번의 자동 입력으로 저장 상태를 전달한다',async()=>{
  const w=new Window();w.document.write(readFileSync(new URL('../extension/popup.html',import.meta.url),'utf8'));const doc=w.document,calls=[];
  const sections=[{key:'educations',label:'학력',records:[{id:'one',title:'가상 학력',fields:[{key:'status',label:'재학 상태',value:'수료'}]}]}];
  const chrome={runtime:{sendMessage:async m=>m.type==='autofill-status'?{ok:true,connected:true,server:'http://127.0.0.1:4318'}:{ok:true,sections}},tabs:{query:async()=>[{id:1,url:'https://s-oil.recruiter.co.kr/v1/applicant/resume-form/123?step=2'}]},scripting:{executeScript:async({args})=>{
    calls.push(args);return [{result:args[0]==='scan'?{scanId:'s',origin:'https://s-oil.recruiter.co.kr',controls:[{id:'status',label:'졸업구분',type:'button-group',filled:true,replaceSelection:true,selectedValue:'졸업',options:['졸업','수료']}]}:{results:[{id:'status',label:'졸업구분',ok:true}]}}];
  }}};
  try{
    const source=readFileSync(new URL('../extension/popup.js',import.meta.url),'utf8').replace(/^import .*\r?\n/,'');
    vm.runInNewContext(source,{document:doc,chrome,allowedPage,formAgent,automaticPlan,educationFamily,setTimeout,navigator:{clipboard:{writeText:async()=>{}}}});
    await new Promise(r=>setImmediate(r));await doc.querySelector('#load').onclick();await doc.querySelector('#scan').onclick();
    assert.match(doc.querySelector('#preview').textContent,/졸업 → 수료/);assert.equal(doc.querySelector('#fill').disabled,false);
    await doc.querySelector('#fill').onclick();assert.equal(calls.find(c=>c[0]==='fill')[1].entries[0].value,'수료');assert.match(doc.querySelector('#fill-results').textContent,/졸업구분: 입력됨/);
  }finally{await w.happyDOM.close();}
});

test('복사가 실패해도 새 진단을 표시하고 파일 저장은 새로 수집한다',async()=>{
  const w=new Window();w.document.write(readFileSync(new URL('../extension/popup.html',import.meta.url),'utf8'));const doc=w.document;let count=0,blob,download;
  w.HTMLAnchorElement.prototype.click=function(){download=this.download;};
  const chrome={runtime:{getManifest:()=>({version:'0.2.8'}),sendMessage:async()=>({ok:true,connected:false})},tabs:{query:async()=>[{id:1,url:'https://hshyosung.recruiter.co.kr/resume'}]},scripting:{executeScript:async()=>[{result:{version:3,captureId:'capture-'+(++count),fields:[],watchStatus:{inputs:0,inputEvents:0},recordedSearchStructures:[]}}]}};
  const source=readFileSync(new URL('../extension/popup.js',import.meta.url),'utf8').replace(/^import .*\r?\n/,'');
  vm.runInNewContext(source,{document:doc,chrome,allowedPage,formAgent,automaticPlan,educationFamily,Blob,URL:{createObjectURL:b=>{blob=b;return 'blob:local-test';},revokeObjectURL:()=>{}},setTimeout:()=>{},navigator:{clipboard:{writeText:async()=>{throw Error('Denied');}}}});
  await new Promise(resolve=>setImmediate(resolve));await doc.querySelector('#diagnose').onclick();
  assert.match(doc.querySelector('#result').textContent,/복사에 실패/);assert.ok(doc.querySelector('#diagnostic-details').open);assert.match(doc.querySelector('#diagnostic-preview').textContent,/capture-1/);assert.match(doc.querySelector('#diagnostic-status').textContent,/관찰 대상 0개/);
  await doc.querySelector('#diagnostic-download').onclick();assert.equal(download,'moa-form-diagnostic-capture-2.json');assert.match(await blob.text(),/capture-2/);assert.match(doc.querySelector('#extension-version').textContent,/0.2.8/);
  await w.happyDOM.close();
});

async function schoolPopup({onlySchool=false,alreadySelected=false,searchError=false,rescanError=false,changeTab=false}={}){
  const w=new Window();w.document.write(readFileSync(new URL('../extension/popup.html',import.meta.url),'utf8'));const doc=w.document;let selected=alreadySelected,scans=0;const calls=[];
  const sections=[{key:'educations',label:'학력',records:[{id:'one',title:'모아대학교',fields:[{key:'schoolName',label:'학교 이름',value:'모아대학교'},{key:'degree',label:'학위',value:'학사'},{key:'gpaScale',label:'만점 기준',value:'4.5'}]}]}];
  const chrome={runtime:{sendMessage:async m=>m.type==='autofill-status'?{ok:true,connected:true,server:'http://127.0.0.1:4318'}:{ok:true,sections}},tabs:{query:async()=>[{id:changeTab&&selected?2:1,url:'https://hshyosung.recruiter.co.kr/resume'}]},scripting:{executeScript:async({args})=>{
    calls.push(args);
    if(args[0]==='scan'){
      scans++;if(rescanError&&scans>1)return [{result:{error:'학력 구역이 여러 개입니다.'}}];
      return [{result:{scanId:'s'+scans,origin:'https://hshyosung.recruiter.co.kr',controls:[{id:'school',label:'학교명',type:'search',inline:true,filled:selected},...(onlySchool?[]:[{id:'scale-'+scans,label:'만점 기준',type:'select-one',unsupported:!selected}])]}}];
    }
    if(args[0]==='fill'){assert.ok(selected);assert.equal(args[1].scanId,'s'+scans);assert.equal(args[1].entries[0].id,'scale-'+scans);assert.equal(args[1].entries[0].value,'4.5');return [{result:{results:[{label:'만점 기준',ok:true}]}}];}
    if(searchError)return [{result:{error:'같은 이름의 학교가 여러 개예요.'}}];
    assert.equal(args[0],'search-open');assert.equal(args[1].value,'모아대학교');await new Promise(r=>setTimeout(r,20));selected=true;return [{result:{ok:true,inline:true,selected:true}}];
  }}};
  const source=readFileSync(new URL('../extension/popup.js',import.meta.url),'utf8').replace(/^import .*\r?\n/,'');
  vm.runInNewContext(source,{document:doc,chrome,allowedPage,formAgent,automaticPlan,educationFamily,setTimeout,navigator:{clipboard:{writeText:async()=>{}}}});
  await new Promise(r=>setImmediate(r));await doc.querySelector('#load').onclick();await doc.querySelector('#scan').onclick();return {w,doc,calls};
}

test('아래 자동 입력 한 번으로 학교 검색·선택 후 새 학적 입력란까지 채운다',async()=>{
  const {w,doc,calls}=await schoolPopup();try{
    assert.equal(doc.querySelectorAll('#preview button').length,0);assert.equal(doc.querySelectorAll('#preview select').length,0);
    assert.match(doc.querySelector('#preview').textContent,/자동 입력 버튼에 포함/);assert.equal(doc.querySelector('#fill').disabled,false);
    await doc.querySelector('#fill').onclick();assert.deepEqual(calls.map(c=>c[0]),['scan','search-open','scan','fill']);
    assert.match(doc.querySelector('#fill-results').textContent,/학교명: 입력됨/);assert.match(doc.querySelector('#fill-results').textContent,/만점 기준: 입력됨/);assert.match(doc.querySelector('#result').textContent,/2개 입력 · 0개 건너뜀/);
  }finally{await w.happyDOM.close();}
});

test('학교만 남았어도 자동 입력 가능하고 이미 선택된 학교는 다시 검색하지 않는다',async()=>{
  for(const options of [{onlySchool:true},{alreadySelected:true}]){
    const {w,doc,calls}=await schoolPopup(options);try{
      assert.equal(doc.querySelector('#fill').disabled,false);await doc.querySelector('#fill').onclick();assert.match(doc.querySelector('#result').textContent,/1개 입력 · 0개 건너뜀/);
      assert.deepEqual(calls.map(c=>c[0]),options.onlySchool?['scan','search-open','scan']:['scan','fill']);
    }finally{await w.happyDOM.close();}
  }
});

test('학교 선택 실패나 도중 탭/학력 영역 변경 시 이어서 쓰지 않고 부분 성공을 구분한다',async()=>{
  for(const options of [{searchError:true},{rescanError:true},{changeTab:true}]){
    const {w,doc,calls}=await schoolPopup(options);try{
      await doc.querySelector('#fill').onclick();assert.ok(!calls.some(c=>c[0]==='fill'));assert.equal(doc.querySelector('#result').dataset.error,'true');
      if(options.searchError){assert.match(doc.querySelector('#result').textContent,/같은 이름/);assert.equal(doc.querySelector('#fill-results').textContent,'');}
      else{assert.match(doc.querySelector('#result').textContent,/학교는 선택됐지만/);assert.match(doc.querySelector('#fill-results').textContent,/학교명: 선택 확인됨/);}
    }finally{await w.happyDOM.close();}
  }
});

test('팝업은 항목별 수동 연결 없이 확실한 값만 미리보기와 입력으로 전달한다',async()=>{
  const w=new Window();w.document.write(readFileSync(new URL('../extension/popup.html',import.meta.url),'utf8'));
  const doc=w.document;const calls=[];
  const sections=[{key:'educations',label:'학력',records:[{id:'one',title:'가상 학교',fields:[{key:'gpa',label:'전체 평점',value:'3.85'},{key:'schoolName',label:'학교 이름',value:'모아대학교'}]}]}];
  const chrome={runtime:{sendMessage:async m=>m.type==='autofill-status'?{ok:true,connected:true,server:'http://127.0.0.1:4318'}:{ok:true,sections}},tabs:{query:async()=>[{id:1,url:'https://hshyosung.recruiter.co.kr/resume'}]},scripting:{executeScript:async ({args})=>{
    calls.push(args);return [{result:args[0]==='scan'?{scanId:'scan',origin:'https://hshyosung.recruiter.co.kr',controls:[{id:'code',label:'학교 코드'},{id:'score',label:'평점',type:'number'},{id:'location',label:'학교소재지',unsupported:true},{id:'search',label:'학교명',type:'search'}]}:{results:[{id:'score',label:'평점',ok:true}]}}];
  }}};
  const source=readFileSync(new URL('../extension/popup.js',import.meta.url),'utf8').replace(/^import .*\r?\n/,'');
  vm.runInNewContext(source,{document:doc,chrome,allowedPage,formAgent,automaticPlan,educationFamily,setTimeout,navigator:{clipboard:{writeText:async()=>{}}}});
  await new Promise(resolve=>setImmediate(resolve));
  await doc.querySelector('#load').onclick();await doc.querySelector('#scan').onclick();
  const preview=doc.querySelector('#preview');assert.equal(preview.querySelectorAll('select').length,0);assert.ok(!preview.textContent.includes('학교 코드'));assert.match(preview.textContent,/3.85/);assert.match(preview.textContent,/자동 연결 1개/);assert.match(preview.textContent,/아직 자동 입력이 연결되지 않은 항목 1개/);
  assert.equal(doc.querySelector('#fill').disabled,false);assert.equal(doc.querySelector('#fill').textContent,'자동으로 연결된 1개 입력');
  await doc.querySelector('#fill').onclick();const fill=calls.find(([action])=>action==='fill');assert.equal(fill[1].entries.length,1);assert.equal(fill[1].entries[0].id,'score');assert.equal(fill[1].entries[0].value,'3.85');
});
