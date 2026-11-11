/**
 * Fusion 富生 — marketing site behaviour (shared by every page under /site).
 * Small, dependency-free. Each block only runs when its markup is on the page.
 * The planner app (/app/) does not load this file.
 */
import { PLANS, PAID_PLAN_KEYS, priceFor, savingsPct } from '../src/entitlements/plans.js';
import { VERSION_LABEL } from '../src/version.js';

// Google Apps Script web app that stores feedback / access requests in the
// developer's private Google Sheet (same endpoint the old site used).
const CONTACT_ENDPOINT =
  'https://script.google.com/macros/s/AKfycbzw4CNQtLY-4A13IPIX8HiAaEcK8Q3OQI3VkBm8Xg71KMMp3OWardiMiXI3BHryaE3TDw/exec';
const CONTACT_EMAIL = 'kochet1188@gmail.com';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const fmt = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(2));
const safeGet = (key) => { try { return localStorage.getItem(key); } catch { return null; } };

// ── Header: mobile menu + current page ───────────────────────────────────────
function initHeader() {
  const header = $('.site-header');
  $$('[data-app-version]').forEach((el) => { el.textContent = VERSION_LABEL; });
  if (!header) return;
  // Signed in = an access code was accepted on this device (same check as the planners).
  const signedIn = safeGet('fusion_gate_passed') === '1' || /(?:^|;\s*)cpf_tier_v1=/.test(document.cookie);
  const signIn = $('[data-signin]', header), signOut = $('[data-signout]', header);
  if (signIn && signOut) {
    signIn.hidden = signedIn; signOut.hidden = !signedIn;
    // Saved plans stay on the device; only the access is cleared. /logout clears the cookies.
    signOut.addEventListener('click', () => { try { localStorage.removeItem('fusion_gate_passed'); localStorage.removeItem('fusion_plan'); } catch { /* private mode */ } });
  }
  const toggle = $('.nav-toggle', header);
  const setOpen = (open) => {
    header.dataset.open = String(open);
    toggle?.setAttribute('aria-expanded', String(open));
    toggle?.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  };
  toggle?.addEventListener('click', () => setOpen(header.dataset.open !== 'true'));
  $$('.site-nav a', header).forEach((a) => a.addEventListener('click', () => setOpen(false)));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setOpen(false); });

  const section = document.body.dataset.page;
  if (section) $$(`.site-nav a[data-nav="${section}"]`).forEach((a) => a.setAttribute('aria-current', 'page'));
  $$('[data-year]').forEach((el) => { el.textContent = String(new Date().getFullYear()); });
}

// ── Theme toggle (shares the planner's 'cpf_theme' setting) ──────────────────
function initThemeToggle() {
  const root = document.documentElement;
  const buttons = $$('[data-theme-toggle]');
  const label = () => buttons.forEach((b) => b.setAttribute('aria-label', root.dataset.theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'));
  buttons.forEach((b) => b.addEventListener('click', () => {
    const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
    root.dataset.theme = next;
    try { localStorage.setItem('cpf_theme', next); } catch { /* ignore */ }
    label();
  }));
  // Follow the device setting while the visitor hasn't chosen (or chose 'system' in the planner)
  const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  mq?.addEventListener?.('change', (e) => {
    const mode = safeGet('cpf_theme');
    if (!mode || mode === 'system') { root.dataset.theme = e.matches ? 'dark' : 'light'; label(); }
  });
  label();
}

// ── Home: returning visitors get a direct link back to their plan ────────────
function initWelcomeBack() {
  const box = $('[data-welcome-back]');
  if (!box) return;
  if (safeGet('cpf_planner_setup_done') || safeGet('fusion_gate_passed') === '1') box.dataset.show = 'true';
}

// ── Pricing: monthly / yearly toggle ─────────────────────────────────────────
function initPricing() {
  const toggle = $('[data-billing-toggle]');
  if (!toggle) return;
  const buttons = $$('button[data-interval]', toggle);
  const saveEl = $('[data-save-max]');
  if (saveEl) saveEl.textContent = `Save up to ${Math.max(...PAID_PLAN_KEYS.map(savingsPct))}%`;

  const render = (interval) => {
    buttons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.interval === interval)));
    PAID_PLAN_KEYS.forEach((key) => {
      const card = $(`[data-plan="${key}"]`);
      if (!card) return;
      const p = PLANS[key];
      const amount = $('[data-amount]', card);
      const per = $('[data-per]', card);
      const note = $('[data-price-note]', card);
      if (interval === 'year') {
        amount.textContent = `S$${fmt(p.price.year)}`;
        per.textContent = p.perSeat ? '/ seat / year' : '/ year';
        note.textContent = `S$${fmt(Math.round((p.price.year / 12) * 100) / 100)} a month, billed yearly · save ${savingsPct(key)}%`;
      } else {
        amount.textContent = `S$${fmt(p.price.month)}`;
        per.textContent = p.perSeat ? '/ seat / month' : '/ month';
        note.textContent = 'Billed monthly by card. Cancel any time.';
      }
      $$('a[data-checkout]', card).forEach((a) => {
        const url = new URL(a.getAttribute('href'), location.origin);
        url.searchParams.set('interval', interval);
        a.setAttribute('href', url.pathname + url.search);
      });
    });
    try { sessionStorage.setItem('fusion_billing_interval', interval); } catch { /* ignore */ }
  };
  buttons.forEach((b) => b.addEventListener('click', () => render(b.dataset.interval)));
  let initial = 'year';
  try { if (sessionStorage.getItem('fusion_billing_interval') === 'month') initial = 'month'; } catch { /* ignore */ }
  render(initial);
}

// ── Contact form (feedback, bug reports, beta access, adviser enquiries) ─────
async function postToSheet(payload) {
  const res = await fetch(CONTACT_ENDPOINT, {
    method: 'POST',
    // text/plain avoids the CORS preflight that Apps Script web apps cannot answer
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!data || !data.success) throw new Error((data && data.message) || 'Submission failed');
  return data;
}

function setStatus(el, state, html) {
  if (!el) return;
  el.dataset.state = state;
  el.innerHTML = html;
}

function initContact() {
  const form = $('#contact-form');
  if (!form) return;
  const status = $('#contact-status');
  const submit = $('button[type="submit"]', form);
  const topic = new URLSearchParams(location.search).get('topic');
  if (topic && form.topic && $(`option[value="${CSS.escape(topic)}"]`, form.topic)) form.topic.value = topic;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (form.website && form.website.value) return; // honeypot
    const email = form.email.value.trim();
    const message = form.message.value.trim();
    if (!EMAIL_RE.test(email)) { setStatus(status, 'error', 'Please enter a valid email address so we can reply.'); form.email.focus(); return; }
    if (!message) { setStatus(status, 'error', 'Please write a short message.'); form.message.focus(); return; }
    submit.disabled = true;
    submit.textContent = 'Sending…';
    try {
      const topicLabel = form.topic.options[form.topic.selectedIndex].text;
      await postToSheet({ name: form.name.value.trim(), email, message: `[${topicLabel}] ${message}`, topic: form.topic.value, source: 'site-contact' });
      form.reset();
      setStatus(status, 'ok', 'Thanks — your message has been sent. We usually reply within two working days.');
    } catch {
      setStatus(status, 'error', `Something went wrong. Please try again, or email <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>.`);
    } finally {
      submit.disabled = false;
      submit.textContent = 'Send message';
    }
  });
}

// ── Checkout ─────────────────────────────────────────────────────────────────
function initCheckout() {
  const form = $('#checkout-form');
  if (!form) return;
  const params = new URLSearchParams(location.search);
  let planKey = PAID_PLAN_KEYS.includes(params.get('plan')) ? params.get('plan') : 'workspace';
  let interval = params.get('interval') === 'month' ? 'month' : 'year';
  const trial = params.get('trial') === '1' && PLANS[planKey].trialDays > 0;
  const status = $('#checkout-status');
  const submit = $('button[type="submit"]', form);

  const syncUrl = () => {
    const u = new URL(location.href);
    u.searchParams.set('plan', planKey);
    u.searchParams.set('interval', interval);
    history.replaceState(null, '', u.pathname + u.search);
  };

  const render = () => {
    const p = PLANS[planKey];
    const method = form.method.value;
    // PayNow cannot auto-renew, so it is offered for yearly billing only.
    const payNow = $('input[name="method"][value="paynow"]', form);
    payNow.disabled = interval === 'month';
    if (interval === 'month' && method === 'paynow') form.method.value = 'card';
    $('[data-paynow-hint]').textContent = interval === 'month'
      ? 'Available on yearly billing only.'
      : 'One payment a year. We email a PayNow invoice before each renewal.';

    $$('input[name="plan"]', form).forEach((r) => { r.checked = r.value === planKey; });
    $$('input[name="interval"]', form).forEach((r) => { r.checked = r.value === interval; });
    $('[data-sum-plan]').textContent = `${p.name}${p.perSeat ? ' · 1 seat' : ''}`;
    $('[data-sum-interval]').textContent = interval === 'year' ? 'Yearly' : 'Monthly';
    const amount = priceFor(planKey, interval);
    $('[data-sum-price]').textContent = `S$${fmt(amount)} / ${interval === 'year' ? 'year' : 'month'}`;
    $('[data-sum-total]').textContent = trial ? 'S$0 today' : `S$${fmt(amount)}`;
    $('[data-sum-trial]').hidden = !trial;
    if (trial) $('[data-sum-trial]').textContent = `${p.trialDays}-day free trial, then S$${fmt(amount)} / ${interval === 'year' ? 'year' : 'month'} unless you cancel.`;
    $('[data-sum-saving]').textContent = interval === 'year' ? `You save ${savingsPct(planKey)}% versus monthly billing.` : 'Switch to yearly billing to save.';
    $('[data-sum-features]').innerHTML = p.highlights.map((f) => `<li>${f}</li>`).join('');
    submit.textContent = trial ? 'Start free trial' : 'Continue to secure payment';
    syncUrl();
  };

  form.addEventListener('change', (e) => {
    if (e.target.name === 'plan') planKey = e.target.value;
    if (e.target.name === 'interval') interval = e.target.value;
    render();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = form.email.value.trim();
    if (!EMAIL_RE.test(email)) { setStatus(status, 'error', 'Please enter a valid email address — your receipt and sign-in link go there.'); form.email.focus(); return; }
    if (!form.agree.checked) { setStatus(status, 'error', 'Please confirm you have read the Terms of use and Privacy policy.'); form.agree.focus(); return; }
    submit.disabled = true;
    const label = submit.textContent;
    submit.textContent = 'Please wait…';
    const order = { plan: planKey, tier: PLANS[planKey].tier, interval, method: form.method.value, email, trial };
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(order),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.url) { location.assign(data.url); return; } // Stripe-hosted payment page
      if (data.status !== 'not_configured') throw new Error(data.message || 'Checkout unavailable');
      // Payments are not switched on yet: record the request so we can follow up.
      await postToSheet({
        name: form.name.value.trim(), email, source: 'site-checkout',
        message: `[Plan request] ${PLANS[planKey].name} · ${interval === 'year' ? 'yearly' : 'monthly'} · ${order.method}${trial ? ' · trial' : ''}`,
      });
      form.hidden = true;
      $('[data-checkout-done]').hidden = false;
      $('[data-done-email]').textContent = email;
    } catch {
      setStatus(status, 'error', `We couldn't start checkout. Nothing has been charged. Please try again, or email <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>.`);
    } finally {
      submit.disabled = false;
      submit.textContent = label;
    }
  });

  render();
}

initHeader();
initThemeToggle();
initWelcomeBack();
initPricing();
initContact();
initCheckout();
