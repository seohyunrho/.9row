import http from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {loadEnvFile} from 'node:process';
import { openStore } from './lib/store.mjs';
import { createGemini } from './lib/gemini.mjs';
import { extensionProfile } from './lib/extension-profile.mjs';
import { importJobFromUrl } from './lib/job-import.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const envPath=path.join(root,'.env');
if(existsSync(envPath))loadEnvFile(envPath);
const port = Number(process.env.PORT || 4317);
const dataDir = path.resolve(process.env.MOA_DATA_DIR || path.join(root, '.data'));
mkdirSync(dataDir, { recursive: true });
const gemini=createGemini({dataDir,...(process.env.MOA_DISABLE_EXTERNAL_AI==='1'?{
  fetchImpl:async()=>{throw new Error('이 시험 공간에서는 외부 AI 요청이 꺼져 있습니다.');},
}:{})});
const store = openStore(path.join(dataDir, 'moa.sqlite'));
const tokenPath = path.join(dataDir, 'extension-token');
if (!existsSync(tokenPath)) writeFileSync(tokenPath, randomBytes(32).toString('hex'));
const extensionToken = readFileSync(tokenPath, 'utf8').trim();
const validToken = value => { const a = Buffer.from(value || ''); const b = Buffer.from(extensionToken); return a.length === b.length && timingSafeEqual(a,b); };
const dev = process.argv.includes('--dev');
const vite = dev ? await (await import('vite')).createServer({ root, server: { middlewareMode: true, host: '127.0.0.1', hmr: false, fs:{deny:['**/.data/**','**/.env','**/.env.*','**/*.sqlite','**/extension-token']} }, appType: 'spa' }) : null;
const json = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };
async function body(req) {
  if (!req.headers['content-type']?.startsWith('application/json')) { const e = new Error('JSON 형식으로 요청해 주세요.'); e.status=415; throw e; }
  let size = 0; const chunks = [];
  for await (const chunk of req) { size += chunk.length; if (size > 4_000_000) { const e = new Error('자료 크기가 너무 큽니다.'); e.status=413; throw e; } chunks.push(chunk); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new Error('입력 자료를 읽을 수 없습니다.'); }
}
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.json': 'application/json', '.woff2':'font/woff2' };
const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  if (![`127.0.0.1:${port}`, `localhost:${port}`].includes(req.headers.host)) return json(res,403,{error:'로컬 주소로만 접근할 수 있습니다.'});
  const origin = req.headers.origin;
  const localOrigin = [`http://127.0.0.1:${port}`, `http://localhost:${port}`].includes(origin);
  const url = new URL(req.url, `http://127.0.0.1:${port}`);
  if (url.pathname.startsWith('/.data') || url.pathname.startsWith('/.env')) return json(res,404,{error:'요청을 찾을 수 없습니다.'});
  const isCapture = url.pathname === '/api/extension/capture';
  const isExtension = isCapture || ['/api/extension/profile','/api/extension/status'].includes(url.pathname);
  const extensionOrigin = /^chrome-extension:\/\/[a-p]{32}$/.test(origin || '');
  if (isExtension && extensionOrigin) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary','Origin'); res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization'); res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS'); }
  if (req.method === 'OPTIONS' && isExtension) { if(!extensionOrigin&&!localOrigin)return json(res,403,{error:'허용되지 않은 페이지의 요청입니다.'});res.writeHead(204); return res.end(); }
  try {
    if (url.pathname.startsWith('/api/')) {
      if (origin && !localOrigin && !(isExtension && extensionOrigin)) return json(res,403,{error:'허용되지 않은 페이지의 요청입니다.'});
      if (req.headers['sec-fetch-site'] === 'cross-site' && !(isExtension&&extensionOrigin)) return json(res,403,{error:'다른 사이트에서는 자료를 읽을 수 없습니다.'});
      if (req.method === 'GET' && url.pathname === '/api/state') return json(res,200,store.read(url.searchParams.get('workspace') || 'personal'));
      if (req.method === 'PUT' && url.pathname === '/api/state') {
        const input=await body(req); if (!Number.isInteger(input.revision)) throw new Error('자료 버전을 확인해 주세요.');
        return json(res,200,store.write(url.searchParams.get('workspace') || 'personal', input.data, input.revision));
      }
      if (req.method === 'POST' && url.pathname === '/api/jobs/import') {
        if (!localOrigin) return json(res,403,{error:'모아 화면에서 공고 링크를 가져와 주세요.'});
        const input=await body(req);
        return json(res,200,{job:await importJobFromUrl(input?.url)});
      }
      if (req.method === 'GET' && url.pathname === '/api/config') return json(res,200,{aiConnected:gemini.status().verified,aiConfigured:gemini.status().configured, storage:'SQLite', extensionMode:'assisted-autofill'});
      if (url.pathname.startsWith('/api/ai/')) {
        if(req.method!=='GET'&&!localOrigin) return json(res,403,{error:'모아 화면에서 요청해 주세요.'});
        if(req.method==='GET'&&url.pathname==='/api/ai/status')return json(res,200,gemini.status());
        if(req.method==='PUT'&&url.pathname==='/api/ai/config')return json(res,200,gemini.configure(await body(req)));
        if(req.method==='POST'&&['/api/ai/test','/api/ai/draft','/api/ai/review'].includes(url.pathname)){
          const input=await body(req);const controller=new AbortController();
          const closed=()=>{if(!res.writableEnded)controller.abort();};res.on('close',closed);
          try{
            const result=await gemini.generate({mode:url.pathname==='/api/ai/review'?'review':'draft',requestText:input?.requestText,consent:input?.consent,test:url.pathname==='/api/ai/test',signal:controller.signal});
            return json(res,200,url.pathname==='/api/ai/test'?{...gemini.status(),message:'Gemini 응답 확인 완료'}:result);
          }finally{res.off('close',closed);}
        }
      }
      if (req.method === 'GET' && url.pathname === '/api/extension-token') return json(res,200,{token:extensionToken});
      if (req.method === 'GET' && ['/api/extension/status','/api/extension/profile'].includes(url.pathname)) {
        if (!validToken(req.headers.authorization?.replace(/^Bearer /,''))) return json(res,401,{error:'모아 설정에서 연결 코드를 다시 복사해 주세요.'});
        if(url.pathname.endsWith('/status'))return json(res,200,{ok:true,mode:'assisted-autofill',version:2});
        const workspace=url.searchParams.get('workspace');
        if(!['personal','demo'].includes(workspace))return json(res,400,{error:'개인 또는 샘플 사무실을 선택해 주세요.'});
        return json(res,200,{workspace,sections:extensionProfile(store.read(workspace).data.profile)});
      }
      if (req.method === 'POST' && isCapture) {
        if (!validToken(req.headers.authorization?.replace(/^Bearer /,''))) return json(res,401,{error:'설정에서 연결 코드를 복사해 주세요.'});
        const recordId=store.capture(await body(req)); return json(res,200,{ok:true,recordId,workspace:'demo'});
      }
      return json(res,404,{error:'요청을 찾을 수 없습니다.'});
    }
    if (vite) return vite.middlewares(req,res);
    const publicRoot=path.join(root,'dist');
    let relative; try { relative=decodeURIComponent(url.pathname); } catch { return json(res,400,{error:'주소를 확인해 주세요.'}); }
    let target=path.resolve(publicRoot, '.'+relative);
    if (!target.startsWith(publicRoot+path.sep) && target !== publicRoot) return json(res,403,{error:'잘못된 경로입니다.'});
    if (!existsSync(target) || !statSync(target).isFile()) target=path.join(publicRoot,'index.html');
    if (!existsSync(target)) return json(res,503,{error:'먼저 npm run build를 실행해 주세요.'});
    res.writeHead(200,{'Content-Type':mime[path.extname(target)] || 'application/octet-stream'}); res.end(readFileSync(target));
  } catch (error) { json(res,error.status || 400,{error:error.message || '처리하지 못했습니다.'}); }
});
server.listen(port,'127.0.0.1',()=>console.log(`모아 사무실: http://127.0.0.1:${port}`));
for (const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>{server.close(); vite?.close(); store.close(); process.exit(0);});
