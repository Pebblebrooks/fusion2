# Changelog

Every release pushed to GitHub gets a new version number here and in `package.json`.
The app shows it at the bottom of each planner screen, in the website footer and at `/healthz`,
together with the commit that was built. `tests/version.test.js` fails if the two disagree.

Version numbers: first number for a redesign, second for new features, third for fixes.

## 3.4.0-studio.6 — 17 Nov 2026
CPF engine corrections (owner-approved) and Family completed. Rules version 2026-11-17.
- **Engine, Education Loan Scheme (corrections P, Q):** tuition paid from the Ordinary Account is now repaid into it by the student, with the interest it would have earned (2.5% a year), in equal yearly instalments over up to 12 years from a year after the course ends. Fees can start at a chosen age instead of only this year. Before, the money was treated as gone for good, so the Ordinary Account was understated. Affects the classic planner too, for plans that use it.
- **Engine, transfers to loved ones (correction S):** a retirement sum is kept back first: the current Full Retirement Sum for parents or grandparents (the Basic Retirement Sum if you own a property that covers the rest), the Basic Retirement Sum for a spouse, the Full Retirement Sum for siblings and in-laws. From 55 the Ordinary Account goes first, then the Retirement Account. The classic planner's existing loved-one switch follows the same rule. A separate yearly transfer can now run alongside your own Ordinary-to-Special transfer.
- Both engines (main and Retirement Sum Scheme) share the rules in `src/engine/family.js`. Engine rows gain `yearEduRepayIn`; recorded test results regenerated with no other change (all 1,057 rows otherwise identical).
- **Family (Studio):** try tuition from your Ordinary Account (amount, start age, years, repayment period) and CPF transfers to a loved one, alongside cash top-ups for parents. Shows what CPF would allow, what comes back, and the effect on income.
- New plan fields for education and transfers (defaults off); classic planner defaults and share links carry the new engine settings.
- Rules version raised to 2026-11-17: adviser reviews flag reports issued under earlier rules.

## 3.4.0-studio.5 — 16 Nov 2026
Fusion Studio, Phase 2 part 2: Family (studio branch preview only). No change to CPF engine calculations.
- **Family:** your household's monthly income with a partner (each person's own plan, from the planner's household model), and the income gap against your target treated as the household's. Partner details save as you type.
- **Helping parents:** try a yearly cash top-up to your parents' CPF. Your own CPF is unchanged; Studio shows the income tax saved (relief up to S$8,000 a year for loved ones, separate from the S$8,000 for your own account, checked against CPF and IRAS rules). Saved moves show "Lowers your tax" on My plan.
- New plan field `parentTopUpYearly` (default 0). It does not reach the engine; plans without it open unchanged.
- **Not yet built, pending your decision on engine changes:** children's education from the Ordinary Account (CPF Education Loan Scheme) and Ordinary Account transfers to parents. Rule checks found the engine does not credit education repayments back to the Ordinary Account, has no start age for education, and does not apply the donor's set-aside before transfers to loved ones.

## 3.4.0-studio.4 — 16 Nov 2026
Fusion Studio, Phase 2 part 1 (studio branch preview only). No change to calculations: the new chapters use the planner's existing, tested models.
- **Home:** what the home loan takes from the Ordinary Account and what that costs in monthly income (the plan re-run without it); a warning if the Ordinary Account runs out before the loan ends. Facts about the home save as you type. Try selling or right-sizing, a next home and the Silver Housing Bonus; Show how has where the sale money goes and the CPF refund.
- **Later life:** the chance your income meets your target (500 runs), your income if one thing goes worse (five cases), and when MediSave runs out with the cash needed to 90. Try other medical-cost rises, an Integrated Shield private part and medical bills.
- **Legacy:** what would be left for family at 75 to 95 (Ordinary Account savings plus CPF LIFE premium not yet paid out), and how CPF nominations work. Try keeping savings untouched or spending them to a different age.
- **What if panel** (header button, any chapter): your three best moves, the yearly top-up that meets your target, and the earliest age you could stop work. Try it opens the chapter that owns the setting with the change ready to save.
- **Planner:** Workspace and Adviser side menus (and More on phones) link to Studio, marked Preview. Hidden while an Adviser has a client file open, because Studio works on your own plan.
- Family is not built yet: it needs new plan fields (see the Studio proposal doc).

## 3.4.0-studio.3 — 16 Nov 2026
Fusion Studio, Phase 1: the core story (studio branch preview only). No change to calculations; every figure comes from the same engine as the planner.
- **Building:** your CPF at 55 (or at payout age once past 55) in today's dollars, with the savings chart. Try a different pay rise or stop-work age. Show how: balances every five years, and money in, interest and money out, which add up to the balance at 55.
- **Turning 55:** how much of the Full Retirement Sum your Retirement Account will hold, against the Basic, Full and Enhanced sums for your year, and what you can take out from 55 (savings above the Full sum, or up to S$5,000). After 55: room left for top-ups up to the Enhanced sum. Try yearly cash top-ups and Ordinary-to-Special transfers.
- **Payout:** monthly income from your payout age: CPF LIFE (for life) and Ordinary Account income (to an age you choose) shown apart, with the income gap. Try a later start, another CPF LIFE plan, or spending the Ordinary Account to a different age. Show how: all three plans' first payouts.
- **Save this move:** changes are tried first and kept only when saved. Saved moves change your plan (also in the planner) and drop any planner what-if on the same setting.
- **My plan:** every saved move with what it adds to monthly income (the plan re-run without it), undo, and print.
- **Today:** when not working, it now says so instead of "S$0 goes in", and the pay box is replaced by your work status.
- Studio's code is split into Today, Chapters, My plan and shared parts, so no file grows too large.

## 3.4.0-studio.2 — 16 Nov 2026
Preview builds for the `studio` branch. No change to the app or to calculations.
- `wrangler.jsonc` gains an empty `previews` section, which Cloudflare Worker Previews need. Production settings are unchanged.
- On a preview, accounts are off (no database or session secret there), so sign-in is hidden and access codes work; live accounts cannot be reached from a preview.

## 3.4.0-studio.1 — 16 Nov 2026
Fusion Studio, Phase 0 (preview on the `studio` branch only; not on the live site). No change to calculations.
- **Fusion Studio** at `/app/studio/`, for Workspace and Adviser: your CPF life told in chapters (Today, Building, Family, Home, Turning 55, Payout, Later life, Legacy, My plan). Guided users and visitors without a plan see a short note and a way back.
- **Chapter 1, Today:** CPF balances now, what goes in each month (the engine's own figure, so PR graduated rates and wage ceilings apply), the monthly income it leads to, and one income gap in dollars. Pay, income wanted and balances can be changed in place; the working sits behind "Show how".
- **One saved plan for both tools:** Studio opens the planner's plan and saves changes back to it. Without a finished plan, Studio shows a sample person and saves nothing.
- **Saved plan version 2:** adds Studio's part (chapter and saved moves). Version 1 plans and client backups open unchanged. The planner no longer overwrites what Studio saved, and picks up changes made in Studio (or another planner tab) without reloading.
- Release check: versions may carry a pre-release label on working branches (for example 3.4.0-studio.1).

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
