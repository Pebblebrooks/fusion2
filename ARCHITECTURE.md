# Fusion 富生 — code layout

One repository, one Cloudflare Worker, one domain. It serves the public
website, the planner app and a small server API.

```
index.html              Home page                      → /
pricing/ checkout/ advisers/ learn/ faq/ contact/ privacy/ terms/
                        Website pages                  → /pricing/ etc.
404.html                Not-found page
app/index.html          New planner page (Guided)      → /app/
app/classic/index.html  Classic planner page          → /app/classic/
site/
  site.css              Website styles (fonts are self-hosted via @fontsource)
  site.js               Website behaviour: menu, pricing toggle, checkout, contact form
  partials/             Header, footer and <head> shared by every website page
public/                 Copied as-is: favicon, robots.txt, sitemap.xml, _headers
tools/site-partials.js  Vite plugin that inserts the partials (<!-- @include header -->)
src/
  main.jsx              Planner browser entry — mounts <App />
  index.css             Planner base CSS
  index.js              Cloudflare Worker (server side). Never put React/JSX here.
  App.jsx               Planner UI (still large — split into features/ in later stages)
  engine/               Pure calculation code. No React, no DOM.
    projection.js       Main CPF projection (CPF LIFE members), Die-with-Zero
    rss.js              Retirement Sum Scheme engine (born before 1958)
    cpfLife.js          CPF LIFE payout tables and Basic-plan mechanics
    common.js           Salary growth factor, BALA table, engine init, seeded RNG
    xirr.js             XIRR solver
    index.js            Public API — import engine code from here
  policy/               Government rules. Update each January.
    cpf2026.js          Rates, retirement sums, BHS, contribution tables, PR tables
    tax.js              IRAS resident tax brackets
  inputs/defaults.js    Input defaults, labels, schema migration, input sanitising
  state/shareLink.js    Share-link encoding/decoding
  entitlements/
    plans.js            Plan names and prices — used by the website, checkout and Worker
    tiers.js            In-app feature locks per tier (client side for now)
  lib/format.js         Formatting helpers
  ui/styles.js          Shared inline style objects
tests/
  engine.golden.test.js Engine must match tests/golden/engine-v170.json exactly
  golden/profiles.js    The 22 test profiles (SC, PR, foreigner, SEP, RSS, events…)
  site.test.js          Every website page: structure, internal links, anchors, prices
  worker.test.js        Worker routes: /app deep links, /api/checkout, /logout, /healthz
legacy/fusionweb-redirect/  Optional Worker that forwards the old website to the new one
```

## Request routing

| Path | Served by |
|---|---|
| `/`, `/pricing/`, … | Static website pages (built HTML) |
| `/app/` | Planner page |
| `/app/<anything>` | Worker → planner page (deep links) |
| `/app/classic/`, `/app/classic/<anything>` | Classic planner page |
| `/app/?p=…` (also `?s=`, `?state=`) | Browser forwards to `/app/classic/` with the same query |
| `/assets/*` | Static, cached for a year (hashed file names) |
| `/api/checkout` | Worker. `POST` starts a payment (501 until Stripe is set up); `GET` redirects to `/checkout/` |
| `/logout`, `/healthz` | Worker |
| anything else | `404.html` with a 404 status |

`run_worker_first` in `wrangler.jsonc` sends `/app/*`, `/api/*`, `/logout` and
`/healthz` to the Worker before static-file handling. Without it, browser page
loads of those paths get the 404 page. Add any new Worker route there too.

## Themes

- **Planner:** `.theme-dark` / `.theme-light` classes in `App.jsx`, chosen in Display
  settings and saved as `cpf_theme` (`dark` · `light` · `system`). Colours hard-coded
  in JSX are re-tinted per theme by the remap rules in the App.jsx style block
  (match the inline `color:` value). Anything rendered into `<body>` through a
  portal must be wrapped in the theme class (see the upgrade dialog).
- **Website:** `data-theme` on `<html>`, set before paint by `partials/head.html`
  from the same `cpf_theme` setting, so the site and planner match. The header
  toggle writes it too. Without JavaScript the device setting is used.

## Plans

| Public name | App tier id | Price |
|---|---|---|
| Guided | `lite` | Free |
| Workspace | `plus` | S$9 / month or S$79 / year |
| Adviser | `pro` | S$49 / seat / month or S$468 / seat / year, 14-day trial |

Change prices in `src/entitlements/plans.js` **and** the static prices in
`pricing/index.html` (shown before JavaScript loads). `npm test` fails if they
disagree. The Worker must look prices up by plan key — never trust a price
sent by the browser.

## Rules

- `engine/` and `policy/` must stay pure: no React, no `window`, no `localStorage`.
- Run `npm run check` (lint + tests + build) before every push.
- A failing golden test means the numbers changed. If a change is *meant* to
  alter the numbers, regenerate the golden file in the same commit and say why.
- Annual policy update: edit `src/policy/cpf2026.js`, then the figures on
  `index.html` and `learn/index.html`.
- New website page: create `<name>/index.html` using the partials, add it to
  `vite.config.js`, `tests/site.test.js` and `public/sitemap.xml`.

## New planner (`src/next/`)

| File | Job |
|---|---|
| `src/model/plan.js` | Pure functions. Answers → engine inputs → every figure on screen (`buildPlan`, `findMoves`). Tested in `tests/plan.model.test.js`. |
| `src/next/GuidedApp.jsx` | Access code, 5-step setup, and the four views: Plan, Moves, Details, Profile. |
| `src/next/Chart.jsx` | Savings chart (hand-drawn SVG, hover values, table view). |
| `src/next/storage.js` | Saved plan (`fusion_guided_plan_v1`), access tier, theme, link into the classic planner. |
| `src/next/guided.css` | Planner styles. Imports `site/site.css` for tokens, buttons and type. Class names must not reuse site ones (`card`, `hero`, `steps`, `plans`, `field`). |
| `src/entitlements/gate.js` | Beta access codes shared by both planners. Client-visible; replace with server sign-in before launch. |

Rules for this planner: one headline answer per screen; money in today's dollars unless labelled;
CPF LIFE (for life) and Ordinary Account income (not for life) are always shown separately; each
suggested move is measured by re-running the engine with that one change.
