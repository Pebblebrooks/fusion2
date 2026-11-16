# Changelog

Every release pushed to GitHub gets a new version number here and in `package.json`.
The app shows it at the bottom of each planner screen, in the website footer and at `/healthz`,
together with the commit that was built. `tests/version.test.js` fails if the two disagree.

Version numbers: first number for a redesign, second for new features, third for fixes.

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
