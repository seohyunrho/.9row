import { createSupabaseStore } from '../lib/supabase-store.mjs';
import { createGemini } from '../lib/gemini.mjs';
import { requireCloudAccess } from '../lib/cloud-access.mjs';
import { importJobFromUrl } from '../lib/job-import.mjs';

const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const json = (res, status, data) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
  res.end(JSON.stringify(data));
};

async function readJson(req) {
  if (typeof req.headers['content-type'] !== 'string' || !req.headers['content-type'].startsWith('application/json')) {
    throw fail('JSON 형식으로 요청해 주세요.', 415);
  }
  let value = req.body;
  if (value === undefined) {
    const chunks = []; let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 4_000_000) throw fail('자료 크기가 너무 큽니다.', 413);
      chunks.push(chunk);
    }
    value = Buffer.concat(chunks).toString('utf8');
  }
  if (Buffer.isBuffer(value)) value = value.toString('utf8');
  if (typeof value === 'string') {
    if (Buffer.byteLength(value) > 4_000_000) throw fail('자료 크기가 너무 큽니다.', 413);
    try { value = JSON.parse(value); } catch { throw fail('입력 자료를 읽을 수 없습니다.'); }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw fail('입력 자료 형식을 확인해 주세요.');
  if (Buffer.byteLength(JSON.stringify(value)) > 4_000_000) throw fail('자료 크기가 너무 큽니다.', 413);
  return value;
}

let store, gemini;
function services() {
  store ||= createSupabaseStore();
  gemini ||= createGemini({ envOnly: true, ...(process.env.MOA_DISABLE_EXTERNAL_AI === '1' ? {
    fetchImpl: async () => { throw new Error('외부 AI 요청이 꺼져 있습니다.'); },
  } : {}) });
  return { store, gemini };
}

export default async function handler(req, res) {
  try {
    // Check before creating clients, reading any data, or making billable requests.
    requireCloudAccess(req);
    const url = new URL(req.url, `https://${req.headers.host}`);
    const route = url.pathname;
    // The local extension uses a localhost token. Do not expose it through cloud hosting.
    if (route.startsWith('/api/extension')) return json(res, 409, { error: '확장 프로그램 연결은 이 컴퓨터에서 실행한 사무실을 이용해 주세요.' });
    const { store, gemini } = services();
    if (req.method === 'GET' && route === '/api/config') {
      const status = gemini.status();
      return json(res, 200, { aiConnected: status.verified, aiConfigured: status.configured,
        storage: 'Supabase', deployment: 'cloud', extensionMode: 'local-only', imageText: 'deferred' });
    }
    if (req.method === 'GET' && route === '/api/state') return json(res, 200, await store.read(url.searchParams.get('workspace') || 'personal'));
    if (req.method === 'PUT' && route === '/api/state') {
      const input = await readJson(req);
      return json(res, 200, await store.write(url.searchParams.get('workspace') || 'personal', input.data, input.revision));
    }
    if (req.method === 'POST' && route === '/api/jobs/import') {
      const input = await readJson(req);
      return json(res, 200, { job: await importJobFromUrl(input.url, { imageText: false, pinDns: true }) });
    }
    if (req.method === 'GET' && route === '/api/ai/status') return json(res, 200, gemini.status());
    if (req.method === 'PUT' && route === '/api/ai/config') {
      return json(res, 405, { error: '온라인에서는 Vercel의 서버 환경변수에서 AI 키와 모델을 설정합니다.' });
    }
    if (req.method === 'POST' && ['/api/ai/test', '/api/ai/draft', '/api/ai/review'].includes(route)) {
      const input = await readJson(req);
      const controller = new AbortController();
      const closed = () => { if (!res.writableEnded) controller.abort(); };
      res.on('close', closed);
      try {
        const result = await gemini.generate({ mode: route.endsWith('/review') ? 'review' : 'draft',
          requestText: input.requestText, consent: input.consent, test: route.endsWith('/test'), signal: controller.signal });
        return json(res, 200, route.endsWith('/test') ? { ...gemini.status(), message: 'Gemini 응답 확인 완료' } : result);
      } finally { res.off('close', closed); }
    }
    return json(res, 404, { error: '요청을 찾을 수 없습니다.' });
  } catch (error) {
    if (res.writableEnded || res.destroyed) return;
    // Provider response bodies, DB errors and credentials never reach the client/logs.
    const status = Number.isInteger(error.status) && error.status >= 400 && error.status <= 599 ? error.status : 400;
    return json(res, status, { error: error.status ? error.message : '요청을 처리하지 못했습니다. 입력 내용을 확인해 주세요.' });
  }
}
