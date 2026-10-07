import { initialState, validateState } from './domain.mjs';
import { normalizeProfile } from './profile.mjs';

const fail = (message, status = 503) => Object.assign(new Error(message), { status });
const conflict = () => fail('다른 창에서 자료가 변경되었습니다. 현재 입력을 복사한 뒤 새로고침해 주세요.', 409);

// Server-only adapter. No Supabase credential is returned to the browser.
export function createSupabaseStore({ env = process.env, fetchImpl = fetch } = {}) {
  let endpoint;
  try {
    endpoint = new URL(env.SUPABASE_URL);
    if (endpoint.protocol !== 'https:' || !/^[a-z0-9-]+\.supabase\.co$/.test(endpoint.hostname)
      || endpoint.port || endpoint.username || endpoint.password || endpoint.pathname !== '/'
      || endpoint.search || endpoint.hash) throw new Error();
  } catch {
    throw fail('온라인 저장소 주소 설정이 필요합니다.');
  }
  const key = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY || '';
  let legacy = false;
  if (!/^sb_secret_[A-Za-z0-9_-]+$/.test(key)) {
    try {
      const parts = key.split('.');
      legacy = parts.length === 3 && JSON.parse(Buffer.from(parts[1], 'base64url').toString()).role === 'service_role';
    } catch { /* An invalid credential must never be printed. */ }
    if (!legacy) throw fail('온라인 저장소의 서버 전용 키 설정이 필요합니다.');
  }
  const headers = { apikey: key, 'Content-Type': 'application/json' };
  // New secret keys are not JWTs and must only be sent in the apikey header.
  if (legacy) headers.Authorization = `Bearer ${key}`;

  const workspaceId = workspace => {
    if (!['personal', 'demo'].includes(workspace)) throw fail('사무실을 찾을 수 없습니다.', 400);
    return workspace;
  };

  async function request(query, { method = 'GET', data, prefer } = {}) {
    let response;
    try {
      response = await fetchImpl(new URL(`/rest/v1/moa_workspaces?${query}`, endpoint), {
        method, headers: { ...headers, ...(prefer ? { Prefer: prefer } : {}) },
        ...(data === undefined ? {} : { body: JSON.stringify(data) }),
        signal: AbortSignal.timeout(20_000), redirect: 'error', cache: 'no-store',
      });
    } catch {
      throw fail('온라인 저장소에 연결하지 못했습니다. 입력 내용을 보관하고 다시 시도해 주세요.');
    }
    if (!response.ok) throw fail('온라인 자료를 처리하지 못했습니다. 저장소 연결과 접근 설정을 확인해 주세요.');
    if (response.status === 204 || prefer?.includes('return=minimal')) return null;
    try { return await response.json(); }
    catch { throw fail('온라인 저장소의 응답을 읽지 못했습니다.'); }
  }

  function unpack(row) {
    if (!row || !Number.isSafeInteger(row.revision) || row.revision < 0 || !row.data) {
      throw fail('저장된 자료 형식을 확인해야 합니다. 기존 자료는 유지됩니다.');
    }
    try { validateState(row.data); }
    catch { throw fail('저장된 자료 형식을 확인해야 합니다. 기존 자료는 유지됩니다.'); }
    row.data.profile = normalizeProfile(row.data.profile);
    return { revision: row.revision, data: row.data };
  }

  async function read(workspace) {
    const id = workspaceId(workspace);
    const query = `id=eq.${id}&select=revision,data`;
    let rows = await request(query);
    if (!Array.isArray(rows)) throw fail('온라인 자료의 응답 형식을 확인해 주세요.');
    if (rows.length === 0) {
      // Ignore a competing first insert, then read the row that actually won.
      await request('on_conflict=id', {
        method: 'POST', data: { id, revision: 0, data: initialState(id === 'demo') },
        prefer: 'resolution=ignore-duplicates,return=minimal',
      });
      rows = await request(query);
    }
    if (!Array.isArray(rows) || rows.length !== 1) throw fail('온라인 자료를 불러오지 못했습니다.');
    return unpack(rows[0]);
  }

  async function write(workspace, data, revision) {
    const id = workspaceId(workspace);
    if (!Number.isSafeInteger(revision) || revision < 0 || revision >= Number.MAX_SAFE_INTEGER) {
      throw fail('자료 버전을 확인해 주세요.', 400);
    }
    validateState(data);
    if (Buffer.byteLength(JSON.stringify(data), 'utf8') > 4_000_000) throw fail('자료 크기가 너무 큽니다.', 413);
    // The revision predicate and update are one database statement (no last-writer overwrite).
    const rows = await request(`id=eq.${id}&revision=eq.${revision}&select=revision,data`, {
      method: 'PATCH', data: { data, revision: revision + 1 }, prefer: 'return=representation',
    });
    if (!Array.isArray(rows)) throw fail('저장 결과를 확인하지 못했습니다. 새로고침해 저장 여부를 확인해 주세요.');
    if (rows.length === 0) throw conflict();
    if (rows.length !== 1) throw fail('저장 결과를 확인하지 못했습니다.');
    return unpack(rows[0]);
  }
  return { read, write };
}
