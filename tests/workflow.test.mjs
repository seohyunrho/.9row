import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeRequirements} from '../lib/requirements.mjs';
import {buildReviewRequest} from '../lib/essay-review.mjs';
import {initialState,validateState} from '../lib/domain.mjs';

test('condition shares count each condition once per posting, keeping identical company postings separate',()=>{
  const summary=summarizeRequirements([{company:'A',requirements:'SQL\n SQL \n협업\n'}, {company:'A',requirements:'SQL\n분석'}, {company:'B',requirements:''}]);
  assert.equal(summary.total,4);assert.equal(summary.jobCount,3);
  assert.equal(summary.entries.find(e=>e.text==='SQL').count,2);
  assert.equal(summary.entries.find(e=>e.text==='SQL').count/summary.total,.5);
  assert.equal(summary.entries.length,3);
});
test('chart retains all conditions and groups long tail without losing counts',()=>{
  const summary=summarizeRequirements([{company:'A',requirements:'a\nb\nc\nd\ne\nf\ng\nh'}]);
  assert.equal(summary.entries.length,8);assert.equal(summary.slices.length,6);
  assert.equal(summary.slices.at(-1).count,3);
  assert.equal(summary.slices.reduce((sum,e)=>sum+e.count,0),summary.total);
  assert.deepEqual(summarizeRequirements([]),{entries:[],total:0,slices:[],jobCount:0});
});
test('review request sends only selected experiences and signals missing evidence',()=>{
  const data=initialState(true),essay=data.essays[0],job=data.jobs.find(j=>j.id===essay.jobId);
  essay.draft='가상 작성문';data.experiences.push({...data.experiences[0],id:'private-unselected',title:'UNSELECTED_PRIVATE_MARKER'});
  const text=buildReviewRequest({essay,job,experiences:data.experiences});
  assert.ok(text.includes(essay.draft));assert.ok(text.includes(data.experiences[0].title));
  assert.ok(!text.includes('UNSELECTED_PRIVATE_MARKER'));
  const missing=buildReviewRequest({essay:{...essay,experienceIds:[]},job:{...job,body:''},experiences:data.experiences});
  assert.match(missing,/공고 원문 미입력/);assert.match(missing,/선택한 경험 없음/);
});
test('review snapshots survive validation and do not replace drafts or versions',()=>{
  const data=initialState(true),essay=data.essays[0];essay.draft='현재 글';
  const before=structuredClone(essay);
  essay.reviews=[{id:'review-1',text:'가상 피드백',model:'test-model',createdAt:new Date().toISOString(),draftSnapshot:'검토 당시 글',questionSnapshot:essay.question}];
  validateState(data);assert.equal(essay.draft,before.draft);assert.deepEqual(essay.versions,before.versions);
  assert.equal(essay.reviews[0].draftSnapshot,'검토 당시 글');
  essay.reviews.push({...essay.reviews[0]});assert.throws(()=>validateState(data),/식별값/);
  essay.reviews=[null];assert.throws(()=>validateState(data),/형식/);
});
