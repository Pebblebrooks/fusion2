// Website checks: every page builds from its partials, has the basics, and
// every internal link points at a page (or Worker route) that exists.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inlinePartials } from '../tools/site-partials.js';
import { PLANS, savingsPct } from '../src/entitlements/plans.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const partials = resolve(root, 'site/partials');
const SITE_PAGES = ['index.html', 'pricing/index.html', 'checkout/index.html', 'advisers/index.html', 'learn/index.html',
  'faq/index.html', 'contact/index.html', 'privacy/index.html', 'terms/index.html', '404.html'];
const WORKER_ROUTES = new Set(['/logout', '/healthz', '/api/checkout']);
const load = (f) => inlinePartials(readFileSync(resolve(root, f), 'utf8'), partials);

test('vite.config.js lists every site page', () => {
  const cfg = readFileSync(resolve(root, 'vite.config.js'), 'utf8');
  for (const f of [...SITE_PAGES, 'app/index.html']) assert.ok(cfg.includes(`'${f}'`), `${f} missing from vite.config.js`);
});

for (const file of SITE_PAGES) {
  test(`${file}: structure`, () => {
    const html = load(file);
    assert.doesNotMatch(html, /@include/, 'unresolved partial');
    assert.match(html, /<title>[^<]+— Fusion 富生<\/title>|<title>Fusion 富生 —/, 'title');
    assert.match(html, /<html lang="en-SG">/);
    assert.match(html, /<main id="main">/);
    assert.match(html, /class="site-header"/);
    assert.match(html, /class="site-footer"/);
    assert.match(html, /name="viewport"/);
    if (file !== '404.html' && file !== 'checkout/index.html') assert.match(html, /<meta name="description" content="[^"]{40,}">/);
    assert.equal((html.match(/<h1[\s>]/g) || []).length, 1, 'exactly one h1');
    assert.doesNotMatch(html, /fusionweb\.ehtan2022/, 'link to the retired website');
  });

  test(`${file}: internal links resolve`, () => {
    const html = load(file);
    const hrefs = [...html.matchAll(/href="(\/[^"]*)"/g)].map((m) => m[1].replace(/&amp;/g, '&'));
    for (const href of hrefs) {
      const path = href.split(/[?#]/)[0];
      if (WORKER_ROUTES.has(path) || path.startsWith('/site/') || path === '/favicon.svg') continue;
      const target = path === '/' ? 'index.html' : path.endsWith('/') ? `${path.slice(1)}index.html` : path.slice(1);
      assert.ok(existsSync(resolve(root, target)) || existsSync(resolve(root, 'public', target)), `${file}: broken link ${href}`);
      const hash = href.split('#')[1];
      if (hash && target.endsWith('.html')) {
        assert.match(load(target), new RegExp(`id="${hash}"`), `${file}: missing anchor ${href}`);
      }
    }
  });
}

test('pricing page shows the prices in plans.js', () => {
  const html = load('pricing/index.html');
  assert.ok(html.includes(`S$${PLANS.workspace.price.year}<`), 'workspace yearly price');
  assert.ok(html.includes(`S$${PLANS.adviser.price.year}<`), 'adviser yearly price');
  assert.ok(html.includes(`save ${savingsPct('workspace')}%`));
  assert.ok(html.includes(`save ${savingsPct('adviser')}%`));
  assert.ok(html.includes(`Save up to ${Math.max(savingsPct('workspace'), savingsPct('adviser'))}%`));
});

test('sitemap lists the public pages', () => {
  const xml = readFileSync(resolve(root, 'public/sitemap.xml'), 'utf8');
  for (const p of ['/', '/pricing/', '/advisers/', '/learn/', '/faq/', '/contact/', '/privacy/', '/terms/']) {
    assert.ok(xml.includes(`workers.dev${p}</loc>`), `sitemap missing ${p}`);
  }
});

test('planner plan names match the website plans', async () => {
  const { TIER_NAMES, TIER_CONFIG, PLAN_REQUIRED_TABS, SECTION_PLAN } = await import('../src/entitlements/tiers.js');
  for (const p of Object.values(PLANS)) {
    assert.equal(TIER_NAMES[p.tier], p.name, `${p.key}: app name differs from website name`);
    assert.equal(TIER_CONFIG[p.tier.toUpperCase()].label, p.name.toUpperCase());
  }
  // Pricing promises every paid feature with Workspace: nothing may require Adviser yet.
  for (const req of [...Object.values(PLAN_REQUIRED_TABS), ...Object.values(SECTION_PLAN)]) assert.equal(req, 'plus');
  const app = readFileSync(resolve(root, 'src/App.jsx'), 'utf8');
  assert.doesNotMatch(app, /plan *=== *'plus'\) *\?|\|\| *plan *=== *'plus'|plan==='plus'\)/, 'feature locked above Workspace in App.jsx');
});

test('sidebar lock badges take their plan from SECTION_PLAN', () => {
  const app = readFileSync(resolve(root, 'src/App.jsx'), 'utf8');
  assert.doesNotMatch(app, /planBadge=\{[^}]*tier: "(plus|pro)"/, 'hard-coded tier in a sidebar lock badge');
});
