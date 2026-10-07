import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {existsSync} from 'node:fs';
const root=path.dirname(fileURLToPath(import.meta.url));
const url='http://127.0.0.1:4317';
const ready=async()=>{try{const r=await fetch(`${url}/api/config`,{signal:AbortSignal.timeout(1000)});const b=await r.json();return r.ok&&b.storage==='SQLite'&&['local-test-only','assisted-autofill'].includes(b.extensionMode);}catch{return false;}};
if(Number(process.versions.node.split('.')[0])<24)throw Error('Node.js 24 이상이 필요합니다.');
if(!await ready()){
  if(!existsSync(path.join(root,'dist','index.html')))throw Error('빌드 결과가 없습니다. 이 폴더에서 npm install과 npm run build를 실행해 주세요.');
  const child=spawn(process.execPath,['server.mjs'],{cwd:root,detached:true,stdio:'ignore',windowsHide:true});child.unref();
  let started=false;for(let i=0;i<30;i++){if(await ready()){started=true;break;}await new Promise(r=>setTimeout(r,300));}
  if(!started)throw Error('사무실을 열지 못했습니다. 4317번 포트를 사용 중인 프로그램이 있는지 확인해 주세요.');
}
if(process.platform==='win32')spawn('cmd.exe',['/c','start','',url],{stdio:'ignore',windowsHide:true}).unref();
console.log(`모아 사무실: ${url}`);
