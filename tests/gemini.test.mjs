import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createGemini,DEFAULT_MODEL} from '../lib/gemini.mjs';

const TEST_KEY='synthetic-test-key-not-a-real-key';
function setup(t,fetchImpl,env={}){
  const dir=mkdtempSync(path.join(tmpdir(),'moa-gemini-test-'));
  t.after(()=>{assert.equal(path.dirname(dir),tmpdir());rmSync(dir,{recursive:true,force:true});});
  return {dir,service:createGemini({dataDir:dir,env,fetchImpl:fetchImpl||(()=>{throw Error('Unexpected external request');})})};
}
const success=text=>new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text}]}}]}),{status:200});

test('key configuration never calls Google or exposes credentials, and survives restart',t=>{
  const {service,dir}=setup(t);
  assert.equal(service.status().configured,false);
  const status=service.configure({apiKey:TEST_KEY});
  assert.equal(status.verified,false);assert.equal(status.configured,true);
  assert.ok(!JSON.stringify(status).includes(TEST_KEY));
  assert.equal(JSON.parse(readFileSync(path.join(dir,'gemini-private.json'))).apiKey,TEST_KEY);
  assert.equal(createGemini({dataDir:dir,env:{}}).status().configured,true);
  assert.throws(()=>service.configure({apiKey:'bad'}),/형식/);
  assert.throws(()=>service.configure({model:'https://attacker.invalid'}),/모델/);
});
test('missing key, missing consent, and oversized requests do not reach provider',async t=>{
  const {service}=setup(t);
  await assert.rejects(service.generate({requestText:'x',consent:true}),/키/);
  service.configure({apiKey:TEST_KEY});
  await assert.rejects(service.generate({requestText:'x'}),/전송/);
  await assert.rejects(service.generate({requestText:'x'.repeat(60001),consent:true}),/60,000/);
});
test('connection test sends only a fixed non-personal sentence; success verifies key',async t=>{
  let payload;
  const {service}=setup(t,async(url,options)=>{assert.ok(!url.includes(TEST_KEY));assert.equal(options.headers['x-goog-api-key'],TEST_KEY);payload=JSON.parse(options.body);return success('OK');});
  service.configure({apiKey:TEST_KEY});
  await service.generate({test:true,requestText:'PRIVATE DATA MUST NOT BE SENT'});
  assert.equal(payload.contents[0].parts[0].text,'OK');
  assert.ok(!JSON.stringify(payload).includes('PRIVATE DATA'));
  assert.equal(service.status().verified,true);
});
test('draft sends only the reviewed request, filters thought output, and returns model metadata',async t=>{
  const {service}=setup(t,async(url,options)=>{
    assert.ok(url.includes(DEFAULT_MODEL));assert.equal(JSON.parse(options.body).contents[0].parts[0].text,'Reviewed request');
    return new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{thought:true,text:'hidden reasoning'},{text:'가상 초안'}]}}]}));
  });
  service.configure({apiKey:TEST_KEY});
  const result=await service.generate({requestText:'Reviewed request',consent:true});
  assert.equal(result.text,'가상 초안');assert.equal(result.model,DEFAULT_MODEL);
});
test('parallel calls and key changes during generation are rejected',async t=>{
  let finish;const {service}=setup(t,()=>new Promise(resolve=>{finish=resolve;}));service.configure({apiKey:TEST_KEY});
  const running=service.generate({test:true});
  await assert.rejects(service.generate({test:true}),e=>e.status===429);
  assert.throws(()=>service.configure({apiKey:TEST_KEY}),e=>e.status===409);
  finish(success('OK'));await running;assert.equal(service.status().running,false);
});
for(const [status,message] of [[403,'권한'],[404,'모델'],[429,'한도'],[500,'처리']]){
  test(`provider ${status} errors are actionable and never echo provider secrets`,async t=>{
    const {service}=setup(t,async()=>new Response(`secret ${TEST_KEY}`,{status}));service.configure({apiKey:TEST_KEY});
    await assert.rejects(service.generate({test:true}),e=>e.message.includes(message)&&!e.message.includes(TEST_KEY));
    assert.equal(service.status().running,false);
  });
}
for(const fixture of [{promptFeedback:{blockReason:'SAFETY'}},{candidates:[{finishReason:'MAX_TOKENS',content:{parts:[{text:'partial'}]}}]},{candidates:[]}]){
  test('blocked, truncated, or empty results are not accepted as drafts',async t=>{
    const {service}=setup(t,async()=>new Response(JSON.stringify(fixture)));service.configure({apiKey:TEST_KEY});
    await assert.rejects(service.generate({test:true}));assert.equal(service.status().verified,false);
  });
}
test('network exception text never leaks credentials',async t=>{
  const {service}=setup(t,async()=>{throw Error(TEST_KEY);});service.configure({apiKey:TEST_KEY});
  await assert.rejects(service.generate({test:true}),e=>!e.message.includes(TEST_KEY)&&e.status===502);
});

test('review uses feedback instructions instead of drafting and requires consent',async t=>{
  let payload;
  const {service}=setup(t,async(url,options)=>{payload=JSON.parse(options.body);return success('가상 검토 피드백');});
  service.configure({apiKey:TEST_KEY});
  await assert.rejects(service.generate({requestText:'검토할 글',mode:'review'}),/전송/);
  await assert.rejects(service.generate({requestText:'검토할 글',mode:'unknown',consent:true}),/지원하지/);
  const result=await service.generate({requestText:'검토할 글',mode:'review',consent:true});
  assert.match(payload.systemInstruction.parts[0].text,/검토 도우미/);
  assert.match(payload.systemInstruction.parts[0].text,/전체 대필하지 말고/);
  assert.equal(payload.contents[0].parts[0].text,'검토할 글');
  assert.equal(result.text,'가상 검토 피드백');
});
