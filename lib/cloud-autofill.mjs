import { requireCloudAccess } from './cloud-access.mjs';
import { extensionProfile } from './extension-profile.mjs';

// Called in the signed-in app tab. No extension token or authentication bypass.
export function createCloudAutofill({ getStore, env = process.env }) {
  return async function handler(req, res) {
    const json = (status, body) => {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
      res.end(JSON.stringify(body));
    };
    try {
      requireCloudAccess(req, env);
      if (req.method !== 'GET') return json(405, { error: '기본 정보 조회만 지원합니다.' });
      const url = new URL(req.url, env.MOA_APP_ORIGIN);
      if (url.search) return json(400, { error: '개인 공간의 기본 정보만 가져올 수 있습니다.' });
      if (url.pathname === '/api/autofill/status') {
        return json(200, { ok: true, version: 3, mode: 'cloud-tab', workspace: 'personal' });
      }
      if (url.pathname !== '/api/autofill/profile') return json(404, { error: '요청을 찾을 수 없습니다.' });
      const { data } = await getStore().read('personal');
      return json(200, { workspace: 'personal', sections: extensionProfile(data.profile) });
    } catch (error) {
      const status = Number.isInteger(error.status) && error.status >= 400 && error.status <= 599 ? error.status : 503;
      return json(status, { error: '기본 정보를 가져오지 못했습니다. 사무실 로그인과 저장 상태를 확인해 주세요.' });
    }
  };
}
