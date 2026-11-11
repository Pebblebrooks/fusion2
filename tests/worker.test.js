// Worker routing checks with a fake static-assets binding.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';

const served = [];
const env = {
  ASSETS: {
    fetch: async (req) => {
      const u = new URL(req.url);
      served.push(u.pathname + u.search);
      return new Response(`asset:${u.pathname}`, { status: u.pathname === '/missing/' ? 404 : 200 });
    },
  },
};
const call = (path, init) => worker.fetch(new Request(`https://fusion.example${path}`, init), env);

test('healthz', async () => {
  const res = await call('/healthz');
  assert.equal(res.status, 200);
  assert.match(await res.text(), /^ok v/); // 'ok' + version label
  assert.equal(res.headers.get('X-Content-Type-Options'), 'nosniff');
});

test('logout clears cookies and goes home', async () => {
  const res = await call('/logout');
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('Location'), '/');
  assert.match(res.headers.get('Set-Cookie'), /cpf_gate_v1=;.*HttpOnly/);
});

test('planner deep links serve the planner page and keep the query', async () => {
  const res = await call('/app/plan?p=abc');
  assert.equal(await res.text(), 'asset:/app/');
  assert.equal(served.at(-1), '/app/?p=abc');
});

test('classic planner links serve the classic page and keep the query', async () => {
  await call('/app/classic?p=abc');
  assert.equal(served.at(-1), '/app/classic/?p=abc');
  await call('/app/classic/plan');
  assert.equal(served.at(-1), '/app/classic/');
});

test('planner asset requests pass through', async () => {
  await call('/app/logo.png');
  assert.equal(served.at(-1), '/app/logo.png');
});

test('checkout: GET redirects to the checkout page', async () => {
  const res = await call('/api/checkout?plan=adviser&interval=month');
  assert.equal(res.status, 303);
  assert.equal(res.headers.get('Location'), 'https://fusion.example/checkout/?plan=adviser&interval=month');
});

test('checkout: valid order returns not_configured until Stripe is set up', async () => {
  const res = await call('/api/checkout', { method: 'POST', body: JSON.stringify({ plan: 'workspace', interval: 'year', method: 'card' }) });
  assert.equal(res.status, 501);
  assert.equal((await res.json()).status, 'not_configured');
});

test('checkout: rejects unknown plans and monthly PayNow', async () => {
  let res = await call('/api/checkout', { method: 'POST', body: JSON.stringify({ plan: 'gold', interval: 'year' }) });
  assert.equal(res.status, 400);
  res = await call('/api/checkout', { method: 'POST', body: JSON.stringify({ plan: 'workspace', interval: 'month', method: 'paynow' }) });
  assert.equal(res.status, 400);
  res = await call('/api/checkout', { method: 'POST', body: 'not json' });
  assert.equal(res.status, 400);
});

test('unknown API routes 404 as JSON', async () => {
  const res = await call('/api/nope');
  assert.equal(res.status, 404);
  assert.equal(res.headers.get('content-type'), 'application/json; charset=utf-8');
});

test('everything else goes to static assets (404 page handled there)', async () => {
  const res = await call('/missing/');
  assert.equal(res.status, 404);
  assert.equal(served.at(-1), '/missing/');
});

// Legacy fusionweb redirect
import legacy, { SECTION_MAP } from '../legacy/fusionweb-redirect/index.js';
import { existsSync } from 'node:fs';
import { resolve as resolvePath, dirname as dirnameOf } from 'node:path';
import { fileURLToPath as toPath } from 'node:url';

test('legacy redirect: root serves the anchor-forwarding page', async () => {
  const res = await legacy.fetch(new Request('https://fusionweb.example/'));
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /location\.replace/);
  assert.match(html, /http-equiv="refresh"/);
});

test('legacy redirect: other paths 301 to the new home page, keeping the query', async () => {
  const res = await legacy.fetch(new Request('https://fusionweb.example/old/page?p=abc'));
  assert.equal(res.status, 301);
  assert.equal(res.headers.get('Location'), 'https://fusion.ehtan2022.workers.dev/?p=abc');
});

test('legacy redirect: every mapped section points at a real page', () => {
  const root = resolvePath(dirnameOf(toPath(import.meta.url)), '..');
  for (const [k, target] of Object.entries(SECTION_MAP)) {
    const path = target.split('#')[0];
    const file = path === '/' ? 'index.html' : `${path.slice(1)}index.html`;
    assert.ok(existsSync(resolvePath(root, file)), `${k} → ${target} missing`);
  }
});
