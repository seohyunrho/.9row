const fail = (message, status) => Object.assign(new Error(message), { status });

// Vercel Authentication / All Deployments is the authentication boundary.
// This switch is an operator acknowledgement, NOT a login mechanism.
// Leave it unset until all URLs are protected and anonymous access is checked.
export function requireCloudAccess(req, env = process.env) {
  if (env.VERCEL !== '1' || env.VERCEL_ENV !== 'production'
    || env.MOA_ACCESS_POLICY !== 'vercel-authentication-all') {
    throw fail('온라인 사무실의 접속 보호 설정을 준비 중입니다.', 503);
  }
  let app;
  try {
    app = new URL(env.MOA_APP_ORIGIN);
    if (app.protocol !== 'https:' || app.username || app.password || app.port
      || app.pathname !== '/' || app.search || app.hash) throw new Error();
  } catch { throw fail('온라인 사무실 주소 설정이 필요합니다.', 503); }
  const hosts = new Set([app.host]);
  // Only the current production deployment URL; never a user-supplied wildcard.
  if (/^[a-z0-9-]+\.vercel\.app$/.test(env.VERCEL_URL || '')) hosts.add(env.VERCEL_URL);
  const host = req.headers.host;
  if (typeof host !== 'string' || !hosts.has(host.toLowerCase())) throw fail('허용되지 않은 앱 주소입니다.', 403);
  const origin = req.headers.origin;
  if (origin !== undefined && origin !== `https://${host.toLowerCase()}`) throw fail('모아 화면에서 요청해 주세요.', 403);
  if (req.headers['sec-fetch-site'] === 'cross-site') throw fail('다른 사이트에서는 자료에 접근할 수 없습니다.', 403);
  if (!['GET', 'HEAD'].includes(req.method) && !origin) throw fail('모아 화면에서 요청해 주세요.', 403);
}
