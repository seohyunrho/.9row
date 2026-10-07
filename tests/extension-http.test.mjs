import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {once} from 'node:events';
import net from 'node:net';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {openStore} from '../lib/store.mjs';
import {blankProfileRecord} from '../lib/profile.mjs';

test('확장 HTTP 인증·교차 출처·자료 공간 분리·읽기 전용',async()=>{
  const reservation=net.createServer();reservation.listen(0,'127.0.0.1');await once(reservation,'listening');const port=reservation.address().port;await new Promise(r=>reservation.close(r));
  const dir=mkdtempSync(path.join(tmpdir(),'moa-extension-test-'));const store=openStore(path.join(dir,'moa.sqlite'));
  const initial=store.read('personal');initial.data.profile.educations=[{...blankProfileRecord('educations','school'),schoolName:'가상 개인 대학',notes:'DO_NOT_EXPORT'}];store.write('personal',initial.data,initial.revision);const before=store.read('personal');store.close();
  const child=spawn(process.execPath,['server.mjs'],{cwd:fileURLToPath(new URL('../',import.meta.url)),env:{...process.env,PORT:String(port),MOA_DATA_DIR:dir,GEMINI_API_KEY:'',GEMINI_MODEL:''},stdio:['ignore','pipe','pipe'],windowsHide:true});
  const base='http://127.0.0.1:'+port;const extension='chrome-extension://'+'a'.repeat(32);
  try{
    await Promise.race([once(child.stdout,'data'),new Promise((_,reject)=>{const t=setTimeout(()=>reject(Error('Startup timeout')),10000);t.unref();})]);
    const {token}=await (await fetch(base+'/api/extension-token')).json();
    const get=(route,origin=extension,auth=token)=>fetch(base+route,{headers:{Origin:origin,Authorization:'Bearer '+auth,'Sec-Fetch-Site':'cross-site'}});
    const route='/api/extension/profile?workspace=personal';
    assert.equal((await get(route,extension,'wrong')).status,401);
    assert.equal((await get(route,'https://career.hyundai-autoever.com')).status,403);
    assert.equal((await get(route,'chrome-extension://invalid')).status,403);
    assert.equal((await get('/api/state')).status,403);
    assert.equal((await get('/api/extension-token')).status,403);
    assert.equal((await get('/api/extension/profile?workspace=unknown')).status,400);
    const r=await get(route);assert.equal(r.status,200);assert.equal(r.headers.get('access-control-allow-origin'),extension);
    const data=await r.json();assert.equal(data.sections[0].records[0].title,'가상 개인 대학');assert.ok(!JSON.stringify(data).includes('DO_NOT_EXPORT'));
    const demo=await (await get('/api/extension/profile?workspace=demo')).json();assert.ok(!JSON.stringify(demo).includes('가상 개인 대학'));
    assert.deepEqual(await (await fetch(base+'/api/state?workspace=personal')).json(),before);
    const options=await fetch(base+'/api/extension/profile',{method:'OPTIONS',headers:{Origin:extension}});assert.equal(options.status,204);assert.ok(options.headers.get('access-control-allow-methods').includes('GET'));
    assert.equal((await fetch(base+'/api/extension/profile',{method:'OPTIONS',headers:{Origin:'https://evil.test'}})).status,403);
  }finally{const exited=once(child,'exit');child.kill();await exited;assert.equal(path.dirname(dir),tmpdir());rmSync(dir,{recursive:true,force:true});}
});
