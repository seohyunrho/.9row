import test from 'node:test';
import assert from 'node:assert/strict';
import { createCloudAutofill } from '../lib/cloud-autofill.mjs';
import { blankProfileRecord } from '../lib/profile.mjs';

const env = { VERCEL: '1', VERCEL_ENV: 'production', MOA_ACCESS_POLICY: 'vercel-authentication-all',
  MOA_APP_ORIGIN: 'https://9row.vercel.app' };
function fixture(overrides = {}) {
  const reads = [];
  const handler = createCloudAutofill({ env: { ...env, ...overrides }, getStore: () => ({
    read: async workspace => {
      reads.push(workspace);
      return { data: { essays: [{ draft: 'PRIVATE_ESSAY' }], profile: { notes: 'PRIVATE_NOTES',
        educations: [{ ...blankProfileRecord('educations', 'one'), schoolName: '가상 대학', notes: 'PRIVATE_RECORD_NOTES' }] } } };
    },
  }) });
  async function request(path = '/api/autofill/profile', headers = {}, method = 'GET') {
    let status, responseHeaders, body;
    await handler({ method, url: path, headers: { host: '9row.vercel.app', ...headers } }, {
      writeHead: (code, values) => { status = code; responseHeaders = values; },
      end: value => { body = JSON.parse(value); },
    });
    return { status, headers: responseHeaders, body };
  }
  return { reads, request };
}

test('cloud autofill returns only supported personal profile fields and does not cache', async () => {
  const { reads, request } = fixture();
  const r = await request();
  assert.equal(r.status, 200);
  assert.deepEqual(reads, ['personal']);
  assert.equal(r.body.workspace, 'personal');
  assert.equal(r.body.sections[0].records[0].title, '가상 대학');
  assert.doesNotMatch(JSON.stringify(r.body), /PRIVATE_|essays|apiKey/);
  assert.equal(r.headers['Cache-Control'], 'private, no-store');
  assert.equal(r.headers['Access-Control-Allow-Origin'], undefined);
});
test('status reads no records and disallows writes, demo selectors and unknown routes', async () => {
  const { reads, request } = fixture();
  assert.equal((await request('/api/autofill/status')).body.version, 3);
  assert.equal((await request('/api/autofill/profile?workspace=demo')).status, 400);
  assert.equal((await request('/api/autofill/profile', { origin: env.MOA_APP_ORIGIN }, 'POST')).status, 405);
  assert.equal((await request('/api/autofill/capture')).status, 404);
  assert.deepEqual(reads, []);
});
test('cloud autofill preserves the cloud origin and deployment protection checks', async () => {
  const { reads, request } = fixture();
  for (const headers of [{ origin: 'https://evil.test' }, { origin: 'chrome-extension://' + 'a'.repeat(32) },
    { host: 'evil.test' }, { 'sec-fetch-site': 'cross-site' }]) assert.equal((await request(undefined, headers)).status, 403);
  assert.deepEqual(reads, []);
  assert.equal((await fixture({ MOA_ACCESS_POLICY: '' }).request()).status, 503);
  assert.equal((await fixture({ VERCEL_ENV: 'preview' }).request()).status, 503);
});

test('Vercel dynamic action query works without allowing workspace or route overrides', async () => {
  const { reads, request } = fixture();
  assert.equal((await request('/api/autofill/status?action=status')).status, 200);
  assert.deepEqual(reads, []);
  assert.equal((await request('/api/autofill/profile?action=profile')).status, 200);
  assert.deepEqual(reads, ['personal']);
  for (const path of ['/api/autofill/status?action=profile', '/api/autofill/profile?action=profile&workspace=demo',
    '/api/autofill/profile?action=profile&action=status', '/api/autofill/profile?url=https://evil.test']) {
    assert.equal((await request(path)).status, 400);
  }
  assert.deepEqual(reads, ['personal']);
});
