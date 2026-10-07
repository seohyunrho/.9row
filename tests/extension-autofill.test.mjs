import test from 'node:test';
import assert from 'node:assert/strict';
import {allowedPage,suggestMappings,formAgent} from '../extension/autofill-core.js';
import {extensionProfile} from '../lib/extension-profile.mjs';
import {blankProfileRecord} from '../lib/profile.mjs';
import {initialState} from '../lib/domain.mjs';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

test('자동 입력은 공식 대상과 명시한 로컬 시험 페이지만 허용한다',()=>{
  assert.ok(allowedPage('https://career.hyundai-autoever.com/ko/o/238124/apply'));
  assert.ok(allowedPage('https://hshyosung.recruiter.co.kr/mrs2/applicant/resume/writeResume'));
  assert.ok(allowedPage('https://s-oil.recruiter.co.kr/v1/applicant/resume-form/266862?step=2'));
  for(const url of ['http://s-oil.recruiter.co.kr/','https://s-oil.recruiter.co.kr.evil.test/','https://another.recruiter.co.kr/'])assert.equal(allowedPage(url),false);
  for(const url of ['https://another.recruiter.co.kr/','https://hshyosung.recruiter.co.kr.evil.test/','http://hshyosung.recruiter.co.kr/'])assert.equal(allowedPage(url),false);
  assert.ok(allowedPage('http://127.0.0.1:4318/autofill-test.html'));
  for(const url of ['https://jasoseol.com/','https://career.hyundai-autoever.com.evil.test/','http://career.hyundai-autoever.com/','http://127.0.0.1:4317/#home','not a url'])assert.equal(allowedPage(url),false);
});
test('직렬화된 페이지 입력 코드도 등록된 회사만 허용하며 미등록 호스트는 거부한다',()=>{
  const scan=url=>vm.runInNewContext('('+formAgent.toString()+')("scan")',{
    URL,location:{href:url,origin:new URL(url).origin},crypto:{randomUUID:()=> 'test-only-scan'},
    document:{querySelectorAll:()=>[],querySelector:()=>null}
  });
  assert.equal(scan('https://hshyosung.recruiter.co.kr/mrs2/applicant/resume/writeResume').controls.length,0);
  assert.equal(scan('https://s-oil.recruiter.co.kr/v1/applicant/resume-form/266862?step=2').controls.length,0);
  assert.ok(scan('https://s-oil.recruiter.co.kr.evil.test/').error);
  assert.ok(scan('http://s-oil.recruiter.co.kr/').error);
  assert.ok(scan('https://another.recruiter.co.kr/mrs2/applicant/resume/writeResume').error);
});
test('한글 학력 별칭을 연결하되 중복·기존값·검색식 입력은 직접 선택한다',()=>{
  const fields=[{key:'schoolName',label:'학교 이름',value:'가상대'},{key:'major',label:'주전공',value:'기획'},{key:'gpa',label:'전체 평점',value:'3.8'}];
  assert.deepEqual(suggestMappings([{label:'학교명 *'},{label:'전공'},{label:'학점'}],fields),['schoolName','major','gpa']);
  assert.deepEqual(suggestMappings([{label:'학교명'},{label:'학교명'},{label:'전공',filled:true},{label:'학점',unsupported:true}],fields),['','','','']);
  assert.deepEqual(suggestMappings([{label:'검색어'},{label:'학교명'}],[{key:'schoolName',label:'학교 이름',value:''}]),['','']);
});
test('확장 프로필은 메모·장문·연락처·오래된 이름 필드를 제외한다',()=>{
  const p={...initialState().profile,name:'PRIVATE_NAME',email:'PRIVATE_EMAIL',educations:[{...blankProfileRecord('educations','one'),schoolName:'가상대',notes:'PRIVATE_NOTE'}],projects:[{...blankProfileRecord('projects','project'),name:'기획',summary:'PRIVATE_SUMMARY',contribution:'PRIVATE_CONTRIBUTION'}]};
  const output=extensionProfile(p);assert.equal(output[0].records[0].title,'가상대');assert.ok(!JSON.stringify(output).includes('PRIVATE_'));
  assert.ok(output.every(s=>s.records.every(r=>r.fields.every(f=>f.type!=='textarea'))));
});
test('확장 백그라운드는 팝업에만 프로필을 전달하고 토큰을 응답에 노출하지 않는다',async()=>{
  let listener;const session={};let requests=0;let access;
  const chrome={runtime:{id:'a'.repeat(32),getURL:p=>'chrome-extension://'+'a'.repeat(32)+'/'+p,onMessage:{addListener:l=>listener=l}},storage:{
    local:{setAccessLevel:async x=>{access=x.accessLevel;},get:async()=>({}),set:async()=>{}},
    session:{get:async()=>session,set:async x=>Object.assign(session,x),remove:async k=>delete session[k]}
  }};
  vm.runInNewContext(readFileSync(new URL('../extension/background.js',import.meta.url),'utf8'),{chrome,URL,AbortSignal,fetch:async()=>{requests++;return {ok:true,json:async()=>({ok:true,version:2,sections:[]})};}});
  const popup={id:chrome.runtime.id,url:chrome.runtime.getURL('popup.html')};
  const invoke=(message,sender=popup)=>new Promise(resolve=>{const kept=listener(message,sender,resolve);if(!kept)resolve(null);});
  assert.equal(await invoke({type:'autofill-profile',workspace:'personal'},{...popup,url:'https://career.hyundai-autoever.com/',tab:{id:1}}),null);
  assert.equal((await invoke({type:'autofill-profile',workspace:'personal'})).ok,false);
  assert.equal((await invoke({type:'autofill-connect',server:'https://evil.test',token:'b'.repeat(64)})).ok,false);assert.equal(requests,0);
  assert.equal((await invoke({type:'autofill-connect',server:'http://127.0.0.1:4317',token:'b'.repeat(64)})).ok,true);
  assert.equal(access,'TRUSTED_CONTEXTS');const status=await invoke({type:'autofill-status'});assert.equal(status.connected,true);assert.ok(!JSON.stringify(status).includes('b'.repeat(64)));
  assert.equal((await invoke({type:'autofill-profile',workspace:'personal'})).ok,true);
  await invoke({type:'autofill-disconnect'});assert.equal((await invoke({type:'autofill-status'})).connected,false);
});
