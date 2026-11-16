/**
 * Fusion 富生 — Cloudflare Worker (server side)
 * ------------------------------------------------------------------------
 * Runs on Cloudflare, NOT in the browser. Never put React/JSX here.
 *
 * Routing:
 *   Static files (website pages, /app/, /assets/*) are served directly by
 *   Cloudflare from the build output and do not reach this code, except
 *   when this code calls env.ASSETS.fetch(). Everything else lands here:
 *
 *   /healthz        uptime check
 *   /logout         clears access cookies, back to the home page
 *   /api/checkout   POST: SIMULATED payment for a signed-in account when accounts
 *                         are available (test only, no money moves); otherwise 501
 *                   GET : redirect to the checkout page
 *   /api/auth/*, /api/account/*, /api/admin/*   accounts (see src/server/accounts.js)
 *   /app/<anything> planner deep links → the planner page (single-page app)
 *   /app/classic/<anything>         → the classic planner page
 *   anything else   404 page (from the assets "not_found_handling" setting)
 *
 * Accounts (proof of concept): email + password in D1, signed session cookie,
 * plan tier held on the server. Beta codes still work alongside. Real payments
 * (Stripe) are not connected; checkout is simulated.
 * ------------------------------------------------------------------------
 */
import { PLANS, PAID_PLAN_KEYS } from './entitlements/plans.js';
import { VERSION_LABEL } from './version.js';
import { available, simulatedCheckout, handleAccount, isAccountRoute, clearAccountCookies } from './server/accounts.js';

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'SAMEORIGIN',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

function withSecurityHeaders(response) {
  const res = new Response(response.body, response);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
    if (!res.headers.has(k)) res.headers.set(k, v);
  }
  return res;
}

const json = (body, status = 200) => withSecurityHeaders(new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
}));

function clearCookie(name, httpOnly) {
  return `${name}=; Path=/; Max-Age=0; Secure; SameSite=Lax${httpOnly ? '; HttpOnly' : ''}`;
}

async function handleCheckout(request, env, url) {
  if (request.method === 'GET') {
    const dest = new URL('/checkout/', url);
    for (const k of ['plan', 'interval', 'trial']) if (url.searchParams.has(k)) dest.searchParams.set(k, url.searchParams.get(k));
    return withSecurityHeaders(Response.redirect(dest.toString(), 303));
  }
  if (request.method !== 'POST') return json({ ok: false, message: 'Method not allowed' }, 405);

  const origin = request.headers.get('Origin');
  if (origin && origin !== url.origin) return json({ ok: false, message: 'Not allowed' }, 403);
  let order;
  try { order = await request.json(); } catch { return json({ ok: false, message: 'Invalid request' }, 400); }
  const plan = PAID_PLAN_KEYS.includes(order?.plan) ? PLANS[order.plan] : null;
  const interval = order?.interval === 'month' ? 'month' : order?.interval === 'year' ? 'year' : null;
  if (!plan || !interval) return json({ ok: false, message: 'Unknown plan or billing period' }, 400);
  if (order.method === 'paynow' && interval !== 'year') return json({ ok: false, message: 'PayNow is available for yearly billing only' }, 400);

  // Proof of concept: with accounts switched on, checkout is simulated for the signed-in user.
  if (available(env)) {
    try { return withSecurityHeaders(await simulatedCheckout(request, env, { plan: plan.key, interval })); } catch (e) {
      console.error('simulated checkout failed', e && e.message);
      return json({ ok: false, message: 'Something went wrong. Nothing has been charged.' }, 500);
    }
  }
  if (!env.STRIPE_SECRET_KEY) {
    // Payments not switched on yet — the checkout page records the request instead.
    return json({ ok: false, status: 'not_configured', message: 'Online payment is not available yet.' }, 501);
  }
  // Payments step: create a Stripe Checkout Session (card, subscription) or an
  // invoice (PayNow, yearly) for plan.key / interval, and return { url }.
  return json({ ok: false, status: 'not_configured', message: 'Online payment is not available yet.' }, 501);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === '/healthz') {
      return withSecurityHeaders(new Response(`ok ${VERSION_LABEL}`, { headers: { 'content-type': 'text/plain' } }));
    }

    if (path === '/logout') {
      const headers = new Headers({ Location: '/' });
      headers.append('Set-Cookie', clearCookie('cpf_gate_v1', true));
      headers.append('Set-Cookie', clearCookie('cpf_tier_v1', false));
      for (const c of clearAccountCookies()) headers.append('Set-Cookie', c);
      return withSecurityHeaders(new Response(null, { status: 302, headers }));
    }

    if (path === '/api/checkout') return handleCheckout(request, env, url);
    if (isAccountRoute(path)) return withSecurityHeaders(await handleAccount(request, env || {}, path));
    if (path.startsWith('/api/')) return json({ ok: false, message: 'Not found' }, 404);

    if (!env || !env.ASSETS) {
      return withSecurityHeaders(new Response(
        'Fusion is deploying — static assets binding (ASSETS) is not configured.',
        { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' } },
      ));
    }

    // Planner deep links (e.g. /app/plan) load the planner page.
    if ((path === '/app' || path.startsWith('/app/')) && request.method === 'GET' && !path.slice(5).includes('.')) {
      // /app/classic/... is the classic planner; everything else under /app/ is the new one.
      const classic = path === '/app/classic' || path.startsWith('/app/classic/');
      const appIndex = new URL(classic ? '/app/classic/' : '/app/', url);
      appIndex.search = url.search;
      return withSecurityHeaders(await env.ASSETS.fetch(new Request(appIndex, request)));
    }

    return withSecurityHeaders(await env.ASSETS.fetch(request));
  },
};
