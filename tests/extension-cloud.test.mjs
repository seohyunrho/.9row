import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { Window } from 'happy-dom';
import { allowedPage, formAgent, automaticPlan, educationFamily } from '../extension/autofill-core.js';

const origin = 'https://9row.vercel.app';
const source = readFileSync(new URL('../extension/background.js', import.meta.url), 'utf8');
function background({ tabs = [{ id: 7, url: origin + '/#home' }], tabOrigin = origin, login = true } = {}) {
  const stored = {}, calls = [];
  let listener;
  const sender = { id: 'extension-id', url: 'chrome-extension://extension-id/popup.html' };
  const chrome = {
    runtime: { id: sender.id, getURL: file => 'chrome-extension://extension-id/' + file, onMessage: { addListener: f => { listener = f; } } },
    storage: { local: { setAccessLevel: async () => {} }, session: {
      set: async value => Object.assign(stored, value), get: async () => stored, remove: async key => { delete stored[key]; },
    } },
    tabs: { query: async query => { assert.equal(query.url, origin + '/*'); return tabs; } },
    scripting: { executeScript: async options => {
      assert.equal(options.world, 'ISOLATED'); assert.equal(options.target.tabId, 7);
      assert.deepEqual(Array.from(options.target.frameIds), [0]);
      const result = await vm.runInNewContext(`(${options.func.toString()})(operation)`, {
        operation: options.args[0], location: { origin: tabOrigin }, AbortSignal,
        fetch: async (url, opts) => {
          calls.push(url); assert.equal(opts.credentials, 'same-origin'); assert.equal(opts.redirect, 'error');
          assert.equal(opts.headers, undefined); assert.equal(opts.cache, 'no-store');
          if (!login) throw Error('SECRET_REDIRECT_DETAILS');
          return Response.json(url.endsWith('/status') ? { version: 3, mode: 'cloud-tab' }
            : { workspace: 'personal', sections: [{ key: 'educations', records: [] }] });
        },
      });
      return [{ result }];
    } },
  };
  vm.runInNewContext(source, { chrome, URL, AbortSignal, fetch: () => { throw Error('Background must not fetch cloud data'); } });
  const send = (message, from = sender) => new Promise(resolve => {
    const handled = listener(message, from, resolve); if (!handled) resolve({ rejected: true });
  });
  return { send, stored, calls, sender };
}
test('online connection uses signed-in exact-origin tab, stores no key, and reads personal only', async () => {
  const b = background();
  assert.equal((await b.send({ type: 'autofill-connect', server: origin, token: 'IGNORED_SECRET' })).ok, true);
  assert.deepEqual(JSON.parse(JSON.stringify(b.stored)), { autofillConnection: { server: origin, mode: 'cloud-tab' } });
  assert.deepEqual(b.calls, ['/api/autofill/status']);
  assert.equal((await b.send({ type: 'autofill-profile', workspace: 'demo' })).ok, false);
  const r = await b.send({ type: 'autofill-profile', workspace: 'personal' });
  assert.equal(r.workspace, 'personal'); assert.deepEqual(b.calls, ['/api/autofill/status', '/api/autofill/profile']);
  await b.send({ type: 'autofill-disconnect' });
  assert.equal((await b.send({ type: 'autofill-profile', workspace: 'personal' })).ok, false);
});
test('closed tab, lookalike origin, navigation race and expired login fail closed', async () => {
  for (const options of [{ tabs: [] }, { tabs: [{ id: 7, url: 'https://9row.vercel.app.evil.test/' }] },
    { tabOrigin: 'https://evil.test' }, { login: false }]) {
    const b = background(options);
    const r = await b.send({ type: 'autofill-connect', server: origin });
    assert.equal(r.ok, false); assert.equal(b.stored.autofillConnection, undefined);
    assert.doesNotMatch(r.error, /SECRET_REDIRECT/);
  }
});
test('webpages and content scripts cannot request profile access through messaging', async () => {
  const b = background();
  for (const from of [{ id: 'other', url: b.sender.url }, { ...b.sender, tab: { id: 9 } },
    { ...b.sender, url: 'https://evil.test' }]) {
    assert.equal((await b.send({ type: 'autofill-connect', server: origin }, from)).rejected, true);
  }
  assert.deepEqual(b.calls, []);
});
test('online popup defaults to personal and connects without token or early profile read', async () => {
  const w = new Window();
  try {
    w.document.write(readFileSync(new URL('../extension/popup.html', import.meta.url), 'utf8'));
    const calls = [], doc = w.document;
    const chrome = { runtime: { sendMessage: async m => { calls.push(m); return { ok: true, connected: false }; } } };
    const popup = readFileSync(new URL('../extension/popup.js', import.meta.url), 'utf8').replace(/^import .*\r?\n/, '');
    vm.runInNewContext(popup, { document: doc, chrome, allowedPage, formAgent, automaticPlan, educationFamily, setTimeout });
    await new Promise(r => setImmediate(r));
    assert.equal(doc.getElementById('server').value, origin);
    assert.equal(doc.getElementById('local-connection').hidden, true);
    assert.equal(doc.getElementById('workspace').value, 'personal');
    await doc.getElementById('connect').onclick();
    assert.equal(calls.at(-1).type, 'autofill-connect');
    assert.equal(doc.getElementById('load').disabled, false);
    assert.equal(calls.some(c => c.type === 'autofill-profile'), false);
    doc.getElementById('server').value = 'http://127.0.0.1:4317';
    await doc.getElementById('server').onchange();
    assert.equal(doc.getElementById('local-connection').hidden, false);
    assert.equal(doc.getElementById('load').disabled, true);
  } finally { await w.happyDOM.close(); }
});
