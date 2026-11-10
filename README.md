# Fusion 富生

CPF retirement planner for Singapore, with its public website, in one
Cloudflare Worker.

- Website: `/` (home), `/pricing/`, `/advisers/`, `/learn/`, `/faq/`, `/contact/`, `/privacy/`, `/terms/`
- Planner (new, Guided): `/app/` — setup, My Plan, Moves, Details, Profile. Saves the plan on the device.
- Classic planner (all tabs): `/app/classic/` — opens from the new planner with the same plan loaded. Old share links (`/app/?p=…`) are forwarded here.
- Checkout: `/checkout/` (records plan requests until online payment is switched on)

Live: https://fusion2.ehtan2022.workers.dev/ (website) · https://fusion2.ehtan2022.workers.dev/app/ (planner)

All planning calculations run in the browser. No financial inputs are sent to
the server. See [ARCHITECTURE.md](ARCHITECTURE.md) for the folder layout and routing.

## Commands

```bash
npm install          # once
npm run dev          # local dev server (site + planner + Worker)
npm test             # engine golden tests, website checks, Worker routes
npm run lint         # ESLint
npm run build        # production build into dist/
npm run check        # lint + test + build — run before every push
npm run deploy       # build and deploy with Wrangler
```

## Deploying with Cloudflare Workers Builds (GitHub)

Repository: `Pebblebrooks/Fusion2` · Worker: `fusion2`. The earlier repository
(`Pebblebrooks/Fusion`) and its Worker are left as they are.

1. In Cloudflare → Workers & Pages → Create → Import a repository → `Fusion2`.
2. Worker name: `fusion2` (must match `name` in `wrangler.jsonc`).
3. Build command: `npm run build` · Deploy command: `npx wrangler deploy` · Root directory: `/`.
4. Every push to `main` then deploys. Plans people have saved in their browser are
   tied to the web address, so keep the Worker name once it is in use.

## Moving from the old setup

- The planner moved from `/` to `/app/`. Old share links (`/?p=…`) are
  forwarded to `/app/` automatically.
- **Legacy redirect: ON HOLD (11 Nov 2026). Do not deploy.** `legacy/fusionweb-redirect/`
  would retire the old website (`fusionweb`) by forwarding its visitors. It is kept in
  the repository but is not part of the build or the deploy, and the old website stays
  live. Its target address still points at the earlier Worker and must be set to the
  final address before it is used.
- `src/index.css` keeps the layout rules from the previous repo; its colours now follow the planner theme instead of the device setting.
- Template leftovers were not carried over: `src/App.css` (never imported), `public/vite.svg`, `src/assets/react.svg` and the ~120 `App - Copy (…).jsx` backups. They remain in the old repository's history.
- Cloudflare Web Analytics (cookieless) is on every page, using the same site token as before.

## Before taking payments

Online payment is not switched on. `/api/checkout` returns “not configured”, and
the checkout page saves the request to the feedback sheet instead. The payments
step will add Stripe (card subscriptions, PayNow invoices for yearly plans),
email sign-in links and server-checked plan access, and remove the access
codes that are currently inside the planner code.

## 2026 policy rules implemented

| Rule | Detail |
|---|---|
| OA interest | 2.5% p.a. base; +1% bonus on first $20,000 (OA floor) |
| SA/RA interest | 4.0% p.a. |
| MA interest | 4.0% p.a.; capped at BHS ($79,000); excess → SA/RA → OA |
| OW ceiling | $8,000/mo (contribution base capped) |
| AW ceiling | $102,000 − total OW subject to CPF |
| SA closure at 55 | SA transfers to RA up to FRS; surplus to OA |
| CPF Annual Limit | $37,740 for voluntary contributions |
| MRSS | Dollar-for-dollar RA top-up match up to $2,000/yr; lifetime cap $20,000; age 55+, RA < BRS |
| MMSS | Dollar-for-dollar MA top-up match up to $1,000/yr; age 55–70, MA < ½ BHS |
| WIS | Employees: 60% CPF (age-band split) + 40% cash; SEPs: 90% MA + 10% cash |
| Property pledge | Only BRS needed in RA at 55; RA above BRS can be withdrawn as cash at pledgeWithdrawalAge |
| Property CPF refund | On sale: cumulative OA housing principal + 2.5%/yr compound interest → OA; with pledge: restores RA to FRS first |
| CPF LIFE deferral | +7% compound per year deferred past 65 |
| 20% RA transfer | At payout age: 20% of (RA − cumulative cash top-ups − cumulative RA interest) transfers to OA |

Update these figures each January in `src/policy/cpf2026.js` (engine) and on the website (`index.html`, `learn/index.html`).

## Rule checks (November 2026)

Engine figures were checked against CPF Board, IRAS and Ministry of Health publications and are
locked in by `tests/compliance.test.js`. Changes made: CPF LIFE payout now uses the Retirement
Account balance on the payout birthday (within 2% of CPF Board's published estimates); 2027
contribution rates for ages 55–65; 2027 retirement sums; resident income tax bands above S$160,000;
MediShield Life premiums from 1 April 2025; wage contributions to the Special Account are no longer
stopped at the Full Retirement Sum; default government grant set to 0. The full list, with sources
and open items, is in the project document "CPF compliance register".

Golden results: `node tools/regen-golden.mjs` rewrites `tests/golden/engine-v171.json`. Run it only
for an intended change to results, and say why in the commit.

## Feedback and bugs

Found a calculation discrepancy? Open an issue with your inputs (age, balances, key settings), the expected and actual output, and a screenshot if possible.

## Legal disclaimer

**Educational Purpose Only.** This application is a prototype simulation tool intended strictly for informational, educational, and testing purposes. It does not constitute professional financial advice.

**Independent Application.** Fusion 富生 and its underlying mathematical models are completely independent. We are neither supported, approved, nor sanctioned by the Central Provident Fund (CPF) Board or any government agency.

**Hypothetical Projections.** All calculations, charts, and inferences generated by this tool are entirely hypothetical. Policy rules are subject to change by the CPF Board. Please consult a certified financial advisor before making any real-world financial decisions.

**No Liability.** The creators and contributors of this application shall not be held liable for any direct, indirect, incidental, or consequential damages, losses, or legal repercussions arising from the use or misuse of this tool.

## Licence

All rights reserved.
