import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {initialState,validateState,applyCapture} from '../lib/domain.mjs';
import {openStore} from '../lib/store.mjs';

test('샘플과 개인 공간은 별도로 저장하고 재실행 후 복원된다',()=>{
  const dir=mkdtempSync(path.join(tmpdir(),'moa-store-test-'));const file=path.join(dir,'data.sqlite');let store=openStore(file);
  try{const demo=store.read('demo');assert.equal(demo.data.jobs.length,3);const p=store.read('personal');p.data.profile.name='시험 사용자';store.write('personal',p.data,p.revision);store.close();store=openStore(file);assert.equal(store.read('personal').data.profile.name,'시험 사용자');assert.equal(store.read('demo').data.profile.name,'');}finally{store.close();assert.equal(path.dirname(path.resolve(dir)),path.resolve(tmpdir()));assert.ok(path.basename(dir).startsWith('moa-store-test-'));rmSync(dir,{recursive:true,force:true});}
});
test('오래된 버전으로 저장하면 최신 내용을 덮어쓰지 않는다',()=>{const store=openStore(':memory:');try{const a=store.read('personal');store.write('personal',a.data,0);assert.throws(()=>store.write('personal',a.data,0),e=>e.status===409);assert.equal(store.read('personal').revision,1);}finally{store.close();}});
test('실패·불명확한 제출은 완료로 바꾸지 않는다',()=>{const state=initialState();applyCapture(state,{eventId:'failed',company:'가상',role:'기획',status:'failed',appliedAt:''});applyCapture(state,{eventId:'unknown',company:'가상',role:'기획',status:'unknown',appliedAt:''});assert.equal(state.applications.filter(a=>a.status==='지원 완료').length,0);assert.equal(state.applications[0].status,'확인 필요');});
test('같은 제출 재시도와 성공 뒤 재감지는 중복을 만들지 않는다',()=>{const state=initialState();const event={eventId:'one',company:'가상',role:'기획',status:'unknown',appliedAt:''};applyCapture(state,event);applyCapture(state,{...event,status:'confirmed',appliedAt:'2026-10-06'});applyCapture(state,{...event,status:'confirmed',appliedAt:'2026-10-06'});applyCapture(state,event);assert.equal(state.applications.length,1);assert.equal(state.applications[0].status,'지원 완료');assert.equal(state.applications[0].appliedAt,'2026-10-06');});
test('다른 접수 사건은 같은 회사·직무라도 보존한다',()=>{const state=initialState();for(const eventId of ['a','b'])applyCapture(state,{eventId,company:'가상',role:'기획',status:'confirmed',appliedAt:'2026-10-06'});assert.equal(state.applications.length,2);});
test('자소서 본문 등 미승인 필드는 수집 API에서 거부한다',()=>{assert.throws(()=>applyCapture(initialState(),{eventId:'a',company:'가상',role:'기획',status:'confirmed',appliedAt:'2026-10-06',essay:'PRIVATE_ESSAY_TEST_MARKER'}),/외 정보/);});
test('공고와 경험 연결이 끊긴 자소서는 저장하지 않는다',()=>{const state=initialState(true);state.essays[0].jobId='missing';assert.throws(()=>validateState(state),/연결된 공고/);state.essays[0].jobId='job-onul';state.essays[0].experienceIds=['missing'];assert.throws(()=>validateState(state),/선택한 경험/);});
test('실행 코드 주소를 공고 링크로 저장하지 않는다',()=>{const state=initialState(true);state.jobs[0].url='javascript:alert(1)';assert.throws(()=>validateState(state),/http/);});
test('지원일 없는 지원 완료는 거부한다',()=>{const state=initialState();state.applications.push({id:'a',company:'회사',role:'직무',status:'지원 완료',appliedAt:'',source:'직접 확인'});assert.throws(()=>validateState(state),/날짜/);});
test('확장 시험 수집은 개인 공간을 변경하지 않는다',()=>{const store=openStore(':memory:');try{store.capture({eventId:'a',company:'회사',role:'직무',status:'confirmed',appliedAt:'2026-10-06'});assert.equal(store.read('personal').data.applications.length,0);assert.equal(store.read('demo').data.applications.length,1);}finally{store.close();}});
test('손상된 백업과 실제로 없는 날짜는 거부한다',()=>{const state=initialState(true);state.profile=null;assert.throws(()=>validateState(state),/자료 형식/);const b=initialState(true);b.jobs[0].deadline='2026-02-31';assert.throws(()=>validateState(b),/날짜/);});
