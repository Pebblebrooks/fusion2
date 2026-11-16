# Changelog

Every release pushed to GitHub gets a new version number here and in `package.json`.
The app shows it at the bottom of each planner screen, in the website footer and at `/healthz`,
together with the commit that was built. `tests/version.test.js` fails if the two disagree.

Version numbers: first number for a redesign, second for new features, third for fixes.

## 3.3.1 — 16 Nov 2026
Classic planner layout only; no change to calculations.
- Wide screens (three input columns): the Quick Start / Full switch now spans all columns, so the columns start side by side under their header buttons. Previously it took the first column and pushed the others along, sending the third column to the bottom of the page in Full view. The same applies to the two-column tablet layout.
- The three column header buttons now show their names (Profile & Contributions, Outflows & Boosts, Wealth & Scenarios) and keep their colour when open, so they no longer look blank.
- Citizenship options wrap onto a second line in narrow columns instead of cutting off "Foreigner".

## 3.3.0 — 16 Nov 2026
Accounts, proof of concept. Engine and planner screens unchanged.
- **Accounts:** create an account and sign in with email and password. Stored in Cloudflare D1 (`fusion2`); passwords hashed with PBKDF2-SHA-256 and a per-user salt; signed, HttpOnly session cookie for 30 days; 15-minute lock after 10 wrong passwords.
- **Plan on the server:** the account's plan is set by the server and sent to both planners in the `cpf_tier_v1` cookie. Beta and upgrade codes still work; the higher of the two applies.
- **Simulated checkout:** with accounts on, the checkout page is marked as a test, needs a signed-in account, records a test payment and sets the plan. No card details are collected and no money is taken.
- **Profile → Account:** email and plan, change plan, cancel plan, delete account (password required; removes the email, plan and payment records).
- **Admin password reset:** `POST /api/admin/reset-password`, only when an `ADMIN_TOKEN` secret is set.
- Codes entered on a device are now kept apart from the account's plan (`fusion_beta_tier`), so a cancelled plan does not stay unlocked after opening the classic planner. Codes entered before this version are carried over.
- Privacy policy: new section on accounts and the sign-in cookie.
- Without the database binding or `SESSION_SECRET`, everything behaves as in 3.2.0.

## 3.2.0 — 16 Nov 2026
- **Healthcare (Workspace):** MediShield Life by age, Integrated Shield private part, CareShield Life and medical bills; MediSave at 65, the age it runs out and the cash needed.
- **Drawdown (Workspace):** how fast to spend the Ordinary Account, an amount to keep back, cash to take at 55, and what would be left for family at 75 to 95.
- **Find my answer (Workspace):** earliest age to stop work, and the yearly top-up needed, to meet the income target.
- **Review all clients (Adviser):** every plan re-run under current rules and set against the last issued report; flags crossed targets, moves over 5% and reports issued under older rules; CSV download. Advice-record entries now carry a rules version.

Engine corrections, each approved by the owner (see the compliance register):
- Integrated Shield Plan: MediSave pays the private part only up to MOH's limit for the age ($300 to 40, $600 from 41 to 70, $900 from 71); the rest is reported as cash.
- CareShield Life: premiums stop after 67, or after 10 years for those who join at 59 or later; optional flat catch-up component for 10 years; base premium flat after 67.
- MediShield Life: the official premium for each age (by age next birthday) is used by default. The classic planner's Manual mode remains, and now follows the same MediSave limits.
- At 55: the first S$5,000 can be withdrawn even when the Ordinary Account alone holds less than that.
- MediSave is never drawn below zero; costs it cannot cover are reported as cash needed.
- All recorded test profiles were regenerated: MediSave balances change, mainly after 65.

## 3.1.0 — 16 Nov 2026
Adviser tools. Guided, Workspace and the engine are unchanged.
- **Client book:** Adviser opens on the client list. Each client shows monthly income against target, readiness, tags and next review date, with search, tag filter, sorting and a flag on overdue reviews. "My plan" is kept as an entry in the list.
- **Meeting mode:** a client's plan as large, read-only pages (where you stand, each of you, your home, what would help most, what this assumes). No other client's data and no adviser notes are shown. Arrow keys move between pages; Esc ends.
- **Branded report:** firm logo (PNG, JPEG or WebP under 200 KB), report colour, adviser name and firm; household and home-sale sections; recommendation and its basis.
- **Advice record:** "Issue report" prints the report and keeps a dated entry of the figures and recommendation for that client. Included in backups.
- Client files from earlier versions and v1 backups still open. A warning shows if the device's storage is full.

## 3.0.0 — 16 Nov 2026
Workspace and Adviser now open on a household dashboard with planning modules, so the paid plans are clearly different from Guided.
- **Overview:** household headline, income against the target, readiness and one card per module.
- **Household:** add a partner; joint income and target, and what each person has alone.
- **Property:** sell or right-size; CPF refund with accrued interest, next home, Silver Housing Bonus, effect on income.
- **Top-ups and tax:** own top-up, partner top-up and SRS compared for a yearly amount, with tax saved.
- **Confidence:** 500 seeded simulations of CPF interest; cautious, middle and favourable income.
- Guided is unchanged. Partner and property answers are set aside when a plan is viewed as Guided.

Engine corrections (checked against HDB and CPF Board; see the compliance register):
- Silver Housing Bonus is a cash bonus worked out from the amount committed to the Retirement Account (up to S$30,000, plus S$10,000 for a 2-room or smaller flat). It was modelled as a Retirement Account credit from an out-of-date table.
- Selling a home from age 55: the refund first fills the Retirement Account to the member's own Full Retirement Sum. The refund is limited to the sale proceeds after the loan.
- CPF used for the home so far (with accrued interest) can be entered and is refunded at sale.
- A cash top-up above the limit (Full Retirement Sum below 55, Enhanced Retirement Sum from 55) is no longer accepted or sent to the Ordinary Account; from 55 top-ups can go up to the Enhanced Retirement Sum.
- Self-employed members' cash top-ups now count while they are working.

## 2.3.1 — 12 Nov 2026
- The planner's access screen accepts all four beta codes: the Workspace code opens Workspace and the Adviser code opens Adviser directly.

## 2.3.0 — 11 Nov 2026
- Version number, build id and build date shown in the planner, website footer and `/healthz`.
- Sign out button in the planner header and footer, and on the website (shown in place of Sign in once signed in). Saved plans and client files stay on the device.

## 2.2.0 — 11 Nov 2026
- Preview switch under Profile: Adviser can view Guided and Workspace; Workspace can view Guided.

## 2.1.1 — 11 Nov 2026
- Teal 富 mark restored on the website and new planner; classic planner keeps its seal.

## 2.1.0 — 11 Nov 2026
- Workspace: Compare, stress test, year-by-year table with CSV, assumptions, report.
- Adviser: client files on the device with backup and restore; firm name and notes on reports.
- Classic planner opens in a new tab.

## 2.0.0 — 11 Nov 2026
- New Guided planner at `/app/`; classic planner moved to `/app/classic/`.
- Engine checked against CPF Board, IRAS and Ministry of Health publications (see the compliance register).
- Worker renamed `fusion2`; legacy redirect on hold.
