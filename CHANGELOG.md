# Changelog

Every release pushed to GitHub gets a new version number here and in `package.json`.
The app shows it at the bottom of each planner screen, in the website footer and at `/healthz`,
together with the commit that was built. `tests/version.test.js` fails if the two disagree.

Version numbers: first number for a redesign, second for new features, third for fixes.

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
