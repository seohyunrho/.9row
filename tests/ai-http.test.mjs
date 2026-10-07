import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {once} from 'node:events';
import net from 'node:net';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

test('AI HTTP routes isolate credentials, require same-origin actions, and preserve workspace data',async()=>{
  const reservation=net.createServer();reservation.listen(0,'127.0.0.1');await once(reservation,'listening');
  const port=reservation.address().port;await new Promise(resolve=>reservation.close(resolve));
  const dir=mkdtempSync(path.join(tmpdir(),'moa-ai-http-test-'));
  const root=fileURLToPath(new URL('../',import.meta.url));
  const child=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,PORT:String(port),MOA_DATA_DIR:dir,GEMINI_API_KEY:'',GEMINI_MODEL:''},stdio:['ignore','pipe','pipe'],windowsHide:true});
  const origin=`http://127.0.0.1:${port}`;
  const send=(route,data,source=origin,method='POST')=>fetch(origin+route,{method,headers:{'Content-Type':'application/json',...(source?{Origin:source}:{})},body:JSON.stringify(data)});
  try{
    await Promise.race([once(child.stdout,'data'),new Promise((_,reject)=>{const timer=setTimeout(()=>reject(Error('Server startup timed out')),10000);timer.unref();})]);
    const initial=await (await fetch(origin+'/api/state?workspace=demo')).json();
    assert.equal((await (await fetch(origin+'/api/ai/status')).json()).configured,false);
    assert.equal((await send('/api/ai/test',{},null)).status,403);
    assert.equal((await send('/api/ai/config',{apiKey:'synthetic-test-only-key-12345'},'https://untrusted.invalid','PUT')).status,403);
    assert.equal((await send('/api/ai/test',{})).status,503);
    assert.equal((await send('/api/ai/review',{requestText:'Synthetic review',consent:true},null)).status,403);
    assert.equal((await send('/api/ai/review',{requestText:'Synthetic review',consent:true})).status,503);
    const configured=await send('/api/ai/config',{apiKey:'synthetic-test-only-key-12345'},origin,'PUT');
    assert.equal(configured.status,200);assert.ok(!(await configured.text()).includes('synthetic'));
    const status=await (await fetch(origin+'/api/ai/status')).json();
    assert.equal(status.configured,true);assert.equal(status.verified,false);assert.equal(status.apiKey,undefined);
    assert.equal((await send('/api/ai/draft',{requestText:'No consent'})).status,400);
    assert.equal((await send('/api/ai/review',{requestText:'No consent'})).status,400);
    assert.equal((await fetch(origin+'/.data/gemini-private.json')).status,404);
    assert.deepEqual(await (await fetch(origin+'/api/state?workspace=demo')).json(),initial);
    const config=await (await fetch(origin+'/api/config')).json();assert.equal(config.aiConfigured,true);assert.equal(config.aiConnected,false);
  }finally{
    const exited=once(child,'exit');child.kill();await exited;
    assert.equal(path.dirname(dir),tmpdir());rmSync(dir,{recursive:true,force:true});
  }
});
