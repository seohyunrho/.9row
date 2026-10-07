import test from 'node:test';
import assert from 'node:assert/strict';
import {deadlineNotices} from '../lib/deadline-notices.mjs';
const today='2026-10-06';
const job=(id,deadline)=>({id,deadline,company:'가상 회사',role:'가상 직무'});
test('today through D-3 flag unwritten essays; D-4 remains upcoming',()=>{
  const notices=deadlineNotices({jobs:[job('a','2026-10-06'),job('b','2026-10-09'),job('c','2026-10-10')]},today);
  assert.deepEqual(notices.map(n=>[n.days,n.urgent]),[[0,true],[3,true],[4,false]]);
});
test('past, missing, and invalid dates are excluded; month rollover works',()=>{
  assert.equal(deadlineNotices({jobs:[job('a','2026-10-05'),job('b',''),job('c','2026-02-30')]},today).length,0);
  assert.equal(deadlineNotices({jobs:[job('a','2026-11-01')]},'2026-10-30')[0].days,2);
});
test('outline and whitespace are not written; another posting draft does not count',()=>{
  const result=deadlineNotices({jobs:[job('a','2026-10-09')],essays:[{jobId:'a',draft:' \n ',outline:'구성만 작성'},{jobId:'b',draft:'다른 공고의 본문'}]},today)[0];
  assert.equal(result.urgent,true);assert.equal(result.status,'자소서 시작 전');
});
test('partial answers remain urgent, fully populated drafts are still writing not complete',()=>{
  const data={jobs:[job('a','2026-10-09')],essays:[{jobId:'a',draft:'작성한 본문'},{jobId:'a',draft:''}]};
  let result=deadlineNotices(data,today)[0];assert.equal(result.urgent,true);assert.equal(result.missing,1);
  data.essays[1].draft='두 번째 본문';result=deadlineNotices(data,today)[0];
  assert.equal(result.urgent,false);assert.equal(result.status,'작성 중 · 본문 저장');
});
test('only explicit completed application links suppress reminders',()=>{
  const data={jobs:[job('a','2026-10-09'),job('b','2026-10-09'),job('c','2026-10-09')],applications:[{jobId:'a',status:'지원 완료'},{jobId:'b',status:'확인 필요'},{company:'가상 회사',role:'가상 직무',status:'지원 완료'}]};
  assert.deepEqual(deadlineNotices(data,today).map(n=>n.job.id),['b','c']);
});
test('urgent unwritten work sorts first without mutating stored job order',()=>{
  const data={jobs:[job('written','2026-10-06'),job('empty','2026-10-09')],essays:[{jobId:'written',draft:'저장된 본문'}]};
  assert.deepEqual(deadlineNotices(data,today).map(n=>n.job.id),['empty','written']);
  assert.equal(data.jobs[0].id,'written');
  assert.deepEqual(deadlineNotices({},today),[]);
});
