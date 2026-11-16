/**
 * Workspace modules (Workspace and Adviser plans). Each screen answers one question:
 *   Overview    — where does my household stand?
 *   Household   — what do we have together, and what if one of us is on our own?
 *   Property    — what would selling or right-sizing my home do?
 *   Top-ups     — where should spare cash go, and what tax does it save?
 *   Confidence  — how sure is this number?
 * Figures come from src/model/plan.js and src/model/household.js.
 */
import { useMemo, useState } from 'react';
import { buildPlan, ageFrom, taxSavedByRelief, RSTU_RELIEF_CAP } from '../model/plan.js';
import { buildHousehold, compareTopUps, runConfidence } from '../model/household.js';
import { SHB, SRS_CAP_SC_PR } from '../policy/cpf2026.js';
import { money, pct, Help, MoneyField, Choice, Slider } from './ui.jsx';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const signed = (v) => (Math.round(v) === 0 ? 'no change' : `${v > 0 ? '+' : '−'}${money(Math.abs(v))}`);

/** Income bar shared by Plan and Overview. `p` needs payoutToday, oaMonthlyToday, otherMonthlyToday, gapToday, target, incomeToday. */
export function IncomeBar({ p }) {
  const scale = Math.max(p.target, p.incomeToday, 1);
  const w = (v) => `${Math.max(0, (v / scale) * 100)}%`;
  const other = p.otherMonthlyToday || 0;
  return (
    <div className="income">
      <div className="bar" role="img" aria-label={`CPF LIFE ${money(p.payoutToday)} a month, Ordinary Account ${money(p.oaMonthlyToday)} a month${other > 0 ? `, from your home sale ${money(other)} a month` : ''}${p.gapToday > 0 ? `, gap ${money(p.gapToday)} a month` : ''}`}>
        <span className="seg-life" style={{ width: w(p.payoutToday) }} />
        {p.oaMonthlyToday > 0 && <span className="seg-oa" style={{ width: w(p.oaMonthlyToday) }} />}
        {other > 0 && <span className="seg-other" style={{ width: w(other) }} />}
        {p.gapToday > 0 && <span className="seg-gap" style={{ width: w(p.gapToday) }} />}
        {p.target > 0 && <i className="target" style={{ left: w(p.target) }} />}
      </div>
      <ul className="bar-key">
        <li><i className="sw life" /><span><b>{money(p.payoutToday)}</b> CPF LIFE <em>for life</em></span></li>
        {p.oaMonthlyToday > 0 && <li><i className="sw oa" /><span><b>{money(p.oaMonthlyToday)}</b> Ordinary Account <em>if spread to age 90</em></span></li>}
        {other > 0 && <li><i className="sw other" /><span><b>{money(other)}</b> From your home sale <em>if spread to age 90</em></span></li>}
        {p.gapToday > 0 && <li><i className="sw gap" /><span><b>{money(p.gapToday)}</b> gap <em>from other savings</em></span></li>}
      </ul>
    </div>
  );
}

/* ── Overview ─────────────────────────────────────────────────────────────── */
export function OverviewView({ answers, plan, moves, changed, onReset, scenarios, go, now }) {
  const hh = useMemo(() => buildHousehold(plan.answers, now), [plan.answers, now]);
  const joint = !!hh.partner;
  const bar = {
    payoutToday: hh.lifeToday, oaMonthlyToday: plan.oaMonthlyToday + (joint ? hh.partner.oaMonthlyToday : 0),
    otherMonthlyToday: plan.otherMonthlyToday, gapToday: hh.gapToday, target: hh.target, incomeToday: hh.incomeToday,
  };
  const enough = hh.target > 0 && hh.gapToday === 0;
  // With a partner, the income part of readiness is measured for the household.
  const parts = plan.parts.map((p) => (joint && p.key === 'income' && hh.coverage !== null ? { ...p, label: 'Household income against your target', value: Math.min(1, hh.coverage) } : p));
  const score = Math.round(parts.reduce((sum, p) => sum + p.weight * p.value, 0) * 100);
  const label = score >= 85 ? 'On track' : score >= 65 ? 'Nearly there' : score >= 40 ? 'Needs attention' : 'Off track';
  const taxAt8k = taxSavedByRelief(plan, RSTU_RELIEF_CAP);
  const cards = [
    { id: 'household', title: 'Household', fig: joint ? money(hh.partner.incomeToday) : null,
      line: joint ? 'a month from your partner’s CPF' : 'Add your partner to plan as a household.', cta: joint ? 'Open' : 'Add partner' },
    { id: 'property', title: 'Property', fig: plan.sale ? (plan.sale.shortfall ? 'Short' : money(Math.round(plan.sale.resources / Math.pow(1 + plan.assumptions.inflation, plan.sale.age - plan.age)))) : answers.ownsHome ? money(answers.homeValue) : null,
      line: plan.sale ? (plan.sale.shortfall ? `Selling at ${plan.sale.age} would not cover the next home.` : `left after selling at ${plan.sale.age} and buying your next home, in today’s dollars`) : answers.ownsHome ? 'home value today. See what selling would do.' : 'Add your home to see what selling or right-sizing would do.', cta: answers.ownsHome ? 'Open' : 'Add home' },
    { id: 'topups', title: 'Top-ups and tax', fig: taxAt8k > 0 ? money(taxAt8k) : null,
      line: taxAt8k > 0 ? 'a year in tax you could save with a S$8,000 top-up' : 'Compare CPF top-ups and SRS for spare cash.', cta: 'Compare' },
    { id: 'confidence', title: 'Confidence', fig: null, line: 'See the range of outcomes across 500 simulated futures.', cta: 'Run' },
    { id: 'moves', title: 'Next moves', fig: moves[0] ? `+${money(moves[0].gain)}` : null,
      line: moves[0] ? `a month: ${moves[0].title.charAt(0).toLowerCase()}${moves[0].title.slice(1)}` : 'Try the levers yourself.', cta: 'Open' },
    { id: 'compare', title: 'Compare', fig: scenarios.length ? `${scenarios.length}` : null,
      line: scenarios.length ? `saved scenario${scenarios.length > 1 ? 's' : ''}` : 'Save what-ifs and compare them side by side.', cta: 'Open' },
  ];
  return (
    <>
      <section className="lead">
        <p className="eyebrow">{joint ? 'Household overview' : `Overview · age ${plan.age}`}</p>
        <h1>{joint ? 'Together, CPF is set to pay your household about ' : 'CPF is set to pay you about '}<span className="fig">{money(hh.incomeToday)}</span> a month.</h1>
        <p className="muted">{money(hh.lifeToday)} of it is CPF LIFE, paid for life{joint ? `, once both payouts have started in ${hh.yearBoth}` : ` from ${plan.payoutAge}`}. Today&rsquo;s dollars. <Help to="cpf-life">How CPF LIFE works</Help></p>
        {changed > 0 && <p className="whatif-note"><span>Includes {changed} what-if change{changed > 1 ? 's' : ''}.</span> <button type="button" className="link" onClick={onReset}>Back to my starting plan</button></p>}
      </section>

      <div className="grid2">
        <section className="panel">
          <h2>{hh.target > 0 ? `Against the ${money(hh.target)} a month ${joint ? 'your household wants' : 'you want'}` : 'Monthly income from CPF'}</h2>
          <IncomeBar p={bar} />
          {hh.target > 0 && <p className={`verdict ${enough ? 'ok' : 'short'}`}>{enough ? 'This covers the target.' : `This covers ${Math.floor(hh.coverage * 100)}% of the target. Short by ${money(hh.gapToday)} a month.`}</p>}
        </section>
        <section className="panel score-card">
          <h2>Readiness</h2>
          <div className="score"><span className="fig">{score}</span><span className="of">/ 100</span><span className={`label l-${label.split(' ')[0].toLowerCase()}`}>{label}</span></div>
          <ul className="parts">{parts.map((p) => <li key={p.key}><span>{p.label}</span><span className="meter" aria-hidden="true"><i style={{ width: pct(p.value) }} /></span><b>{pct(p.value)}</b></li>)}</ul>
        </section>
      </div>

      {plan.watch[0] && <section className="panel watch" role="note"><h2><span aria-hidden="true">⚠ </span>Watch out</h2><p>{plan.watch[0].text}</p></section>}

      <section>
        <h2 className="section-title">Your planning modules</h2>
        <ul className="mod-grid">
          {cards.map((c) => (
            <li key={c.id} className="panel mod">
              <p className="eyebrow">{c.title}</p>
              {c.fig && <p className="mod-fig fig">{c.fig}</p>}
              <p className="mod-line">{c.line}</p>
              <button type="button" className="btn btn-secondary" onClick={() => go(c.id)}>{c.cta}<span className="visually-hidden"> {c.title}</span></button>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

/* ── Household ────────────────────────────────────────────────────────────── */
export function HouseholdView({ answers, setAnswer, now }) {
  const hh = useMemo(() => buildHousehold(answers, now), [answers, now]);
  const a = answers, years = [];
  for (let y = new Date().getFullYear() - 16; y >= 1936; y--) years.push(y);
  const pAge = ageFrom(a.pBirthYear, a.pBirthMonth, now).age;
  return (
    <>
      <section className="lead compact">
        <p className="eyebrow">Household</p>
        <h1>{hh.partner ? <>Together you are set for about <span className="fig">{money(hh.incomeToday)}</span> a month.</> : 'Plan as a household.'}</h1>
        <p className="muted">Each person has their own CPF and their own CPF LIFE payout. A payout stops when that person dies, so it helps to see both the joint figure and each of you alone.</p>
      </section>

      <section className="panel">
        <Choice label="Do you want to include a partner?" name="haspartner" value={a.hasPartner} onChange={(v) => setAnswer({ hasPartner: v })} options={[[false, 'Just me'], [true, 'Me and my partner']]} />
      </section>

      {a.hasPartner && <>
        <section className="panel">
          <h2>Results</h2>
          <div className="table-scroll">
            <table className="data compare">
              <thead><tr><th scope="col"><span className="visually-hidden">Measure</span></th><th scope="col">You</th><th scope="col">Partner</th><th scope="col">Together</th></tr></thead>
              <tbody>
                <tr><th scope="row">Monthly income</th><td>{money(hh.you.incomeToday)}</td><td>{money(hh.partner.incomeToday)}</td><td>{money(hh.incomeToday)}</td></tr>
                <tr><th scope="row">CPF LIFE, for life</th><td>{money(hh.you.payoutToday)}</td><td>{money(hh.partner.payoutToday)}</td><td>{money(hh.lifeToday)}</td></tr>
                <tr><th scope="row">Payouts start</th><td>{hh.you.yearPayout} (age {hh.you.payoutAge})</td><td>{hh.partner.yearPayout} (age {hh.partner.payoutAge})</td><td>Both by {hh.yearBoth}</td></tr>
                <tr><th scope="row">Full Retirement Sum at 55</th><td>{pct(hh.you.frsCoverage)}</td><td>{pct(hh.partner.frsCoverage)}</td><td>—</td></tr>
              </tbody>
            </table>
          </div>
          {hh.target > 0 && <p className={`verdict ${hh.gapToday === 0 ? 'ok' : 'short'}`}>{hh.gapToday === 0 ? `Together this covers your household target of ${money(hh.target)} a month.` : `Together this is ${money(hh.gapToday)} a month short of your household target of ${money(hh.target)}.`}</p>}
          <p className="muted small">On your own: you would have {money(hh.alone.you)} a month, your partner {money(hh.alone.partner)}. CPF savings left at death go to the people named in each person&rsquo;s CPF nomination; they are not added to the survivor&rsquo;s payout automatically.</p>
        </section>

        <div className="profile">
          <section className="panel"><h2>About your partner</h2><div className="fields">
            <div className="row2">
              <label className="fld" htmlFor="p-month"><span className="field-label">Birth month</span>
                <select id="p-month" value={a.pBirthMonth} onChange={(e) => setAnswer({ pBirthMonth: Number(e.target.value) })}>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select></label>
              <label className="fld" htmlFor="p-year"><span className="field-label">Birth year</span>
                <select id="p-year" value={a.pBirthYear} onChange={(e) => setAnswer({ pBirthYear: Number(e.target.value) })}>{years.map((y) => <option key={y}>{y}</option>)}</select></label>
            </div>
            <Choice label="Sex" name="psex" value={a.pIsMale} onChange={(v) => setAnswer({ pIsMale: v })} options={[[true, 'Male'], [false, 'Female']]} />
            <Choice label="Status" name="pstatus" value={a.pStatus} onChange={(v) => setAnswer({ pStatus: v })} options={[['SC', 'Citizen'], ['PR3', 'PR, 3rd year on'], ['PR2', 'PR, 2nd year'], ['PR1', 'PR, 1st year']]} />
          </div></section>
          <section className="panel"><h2>Their work</h2><div className="fields">
            <Choice label="How do they work?" name="pwork" value={a.pWork} onChange={(v) => setAnswer({ pWork: v })} options={[['employee', 'Employee'], ['self', 'Self-employed'], ['none', 'Not working']]} />
            {a.pWork === 'employee' && <>
              <MoneyField id="p-salary" label="Monthly salary before CPF" value={a.pSalary} onChange={(v) => setAnswer({ pSalary: v })} />
              <Slider id="p-bonus" label="Yearly bonus" value={a.pBonusMonths} min={0} max={6} step={0.5} onChange={(v) => setAnswer({ pBonusMonths: v })} format={(v) => `${v} month${v === 1 ? '' : 's'}`} />
            </>}
            {a.pWork === 'self' && <MoneyField id="p-trade" label="Yearly net trade income" value={a.pTradeIncome} onChange={(v) => setAnswer({ pTradeIncome: v })} />}
            {a.pWork !== 'none' && <Slider id="p-stop" label="Works until" value={Math.max(a.pStopWorkAge, pAge)} min={Math.max(55, pAge)} max={75} step={1} onChange={(v) => setAnswer({ pStopWorkAge: v })} format={(v) => `${v}`} />}
          </div></section>
          <section className="panel"><h2>Their CPF today</h2><div className="fields">
            <MoneyField id="p-oa" label="Ordinary Account (OA)" value={a.pOa} onChange={(v) => setAnswer({ pOa: v })} />
            <MoneyField id="p-sa" label={pAge >= 55 ? 'Retirement Account (RA)' : 'Special Account (SA)'} value={a.pSa} onChange={(v) => setAnswer({ pSa: v })} />
            <MoneyField id="p-ma" label="MediSave Account (MA)" value={a.pMa} onChange={(v) => setAnswer({ pMa: v })} />
          </div></section>
          <section className="panel"><h2>Your shared goal</h2><div className="fields">
            <MoneyField id="hh-target" label="Monthly income your household wants" value={a.targetIncome} onChange={(v) => setAnswer({ targetIncome: v })} suffix="in today's dollars" />
            <Slider id="p-payout" label="Partner starts CPF LIFE payouts at" value={a.pPayoutAge} min={65} max={70} step={1} onChange={(v) => setAnswer({ pPayoutAge: v })} format={(v) => `${v}`} />
          </div></section>
        </div>
      </>}
    </>
  );
}

/* ── Property ─────────────────────────────────────────────────────────────── */
export function PropertyView({ answers, setAnswer, plan, now }) {
  const a = answers, age = plan.age, selling = a.sellHomeAge > age, s = plan.sale;
  const keep = useMemo(() => (selling ? buildPlan({ ...plan.answers, sellHomeAge: 0 }, now) : null), [selling, plan.answers, now]);
  const citizen = a.status === 'SC', shbAge = a.sellHomeAge >= SHB.minAge;
  return (
    <>
      <section className="lead compact">
        <p className="eyebrow">Property</p>
        <h1>{s && keep ? (Math.round(plan.incomeToday - keep.incomeToday) === 0 ? `Selling at ${s.age} would not change your monthly income.` : <>Selling at {s.age} would change your income by <span className="fig">{signed(plan.incomeToday - keep.incomeToday)}</span> a month.</>) : 'What would selling or right-sizing your home do?'}</h1>
        <p className="muted">When you sell, the CPF you used for the home goes back into your CPF with 2.5% a year interest. From 55, it first fills your Retirement Account to your Full Retirement Sum. <Help to="playbook">Property and CPF</Help></p>
      </section>

      <section className="panel">
        <Choice label="Do you own your home?" name="owns" value={a.ownsHome} onChange={(v) => setAnswer({ ownsHome: v })} options={[[false, 'No'], [true, 'Yes']]} />
      </section>

      {a.ownsHome && <div className="profile">
        <section className="panel"><h2>Your home</h2><div className="fields">
          <MoneyField id="pr-value" label="What it is worth today" value={a.homeValue} onChange={(v) => setAnswer({ homeValue: v })} />
          <Slider id="pr-growth" label="Value rises each year by" value={a.homeGrowth} min={0} max={5} step={0.5} onChange={(v) => setAnswer({ homeGrowth: v })} format={(v) => `${v}%`} />
          <MoneyField id="pr-used" label="CPF used for it so far, with accrued interest" value={a.cpfUsedForHome} onChange={(v) => setAnswer({ cpfUsedForHome: v })}
            hint="On your CPF statement under Home ownership: principal withdrawn plus accrued interest. Your share only." />
        </div></section>

        <section className="panel"><h2>Selling</h2><div className="fields">
          <Choice label="Plan" name="sell" value={selling} onChange={(v) => setAnswer({ sellHomeAge: v ? Math.max(age + 1, 65) : 0 })} options={[[false, 'Keep it'], [true, 'Sell it']]} />
          {selling && <>
            <Slider id="pr-age" label="Sell when you are" value={a.sellHomeAge} min={age + 1} max={90} step={1} onChange={(v) => setAnswer({ sellHomeAge: v })} format={(v) => `${v}`} />
            <MoneyField id="pr-loan" label="Home loan still owed then" value={a.loanOwedAtSale} onChange={(v) => setAnswer({ loanOwedAtSale: v })} hint="Leave at 0 if the loan will be paid off." />
            <MoneyField id="pr-next" label="Cost of your next home" value={a.nextHomeCost} onChange={(v) => setAnswer({ nextHomeCost: v })} suffix="in today's prices" hint="Leave at 0 if you will rent or live with family." />
          </>}
        </div></section>

        {selling && <section className="panel"><h2>Silver Housing Bonus</h2><div className="fields">
          {!citizen || !shbAge ? (
            <p className="muted">Available when a Singapore Citizen aged {SHB.minAge} or older sells and moves to a 3-room or smaller HDB flat. {citizen ? `Set the sale age to ${SHB.minAge} or later to include it.` : ''}</p>
          ) : <>
            <Choice label="Moving to a 3-room or smaller HDB flat?" name="shb" value={a.shb} onChange={(v) => setAnswer({ shb: v })} options={[[false, 'No'], [true, 'Yes']]} />
            {a.shb && <>
              <Choice label="Next flat" name="shbflat" value={a.shbNextFlat} onChange={(v) => setAnswer({ shbNextFlat: v })} options={[['3r', '3-room'], ['2r', '2-room or smaller']]} />
              <Slider id="pr-commit" label="Commit to your Retirement Account" value={a.shbCommit} min={0} max={SHB.maxCommit} step={5000} onChange={(v) => setAnswer({ shbCommit: v })} format={money} />
              <p className="field-hint">HDB pays S$1 in cash for every S$2 committed, up to S$30,000, plus S$10,000 for a 2-room or smaller flat. Household income must be S$14,000 a month or less. HDB confirms the amount when you apply.</p>
            </>}
          </>}
        </div></section>}

        {s && s.refund !== null && <section className="panel"><h2>Where the money goes at {s.age}</h2>
          <table className="data waterfall">
            <tbody>
              <tr><th scope="row">Sale price in {s.year}</th><td>{money(s.price)}</td></tr>
              {s.loanOwed > 0 && <tr><th scope="row">Home loan repaid</th><td>− {money(s.loanOwed)}</td></tr>}
              {s.nextCost > 0 && <tr><th scope="row">Next home</th><td>− {money(s.nextCost)}</td></tr>}
              {s.shb && <tr><th scope="row">Committed to Retirement Account</th><td>− {money(s.committed)}</td></tr>}
              {s.shb && <tr><th scope="row">Silver Housing Bonus (cash)</th><td>+ {money(s.bonus)}</td></tr>}
              <tr className="total"><th scope="row">{s.resources >= 0 ? 'Left over' : 'Shortfall'}</th><td>{money(Math.abs(s.resources))}</td></tr>
              {s.resources >= 0 && <tr><th scope="row">of which back in your CPF</th><td>{money(s.inCpf)}</td></tr>}
              {s.resources >= 0 && <tr><th scope="row">of which cash in hand</th><td>{money(s.cash)}</td></tr>}
            </tbody>
          </table>
          <p className="small muted">Figures in {s.year} dollars. You must return {money(s.refund)} to your CPF (what you used plus 2.5% a year interest){s.refund > s.inCpf && s.resources >= 0 ? `; ${money(s.refund - s.inCpf)} of it goes towards the next home` : ''}.{s.resources < 0 ? ' You would need other savings or a cheaper next home.' : ''}{s.shb && s.committed < a.shbCommit ? ` Only ${money(s.committed)} can be committed: the Retirement Account cannot go above the current Full Retirement Sum this way.` : ''} Selling costs and stamp duty are not included.</p>
          {keep && <ul className="delta-list">
            <li><span>CPF LIFE, for life</span><b>{signed(plan.payoutToday - keep.payoutToday)}</b></li>
            <li><span>Ordinary Account, to 90</span><b>{signed(plan.oaMonthlyToday - keep.oaMonthlyToday)}</b></li>
            <li><span>From the sale, spread to 90</span><b>{signed(plan.otherMonthlyToday)}</b></li>
            <li className="total"><span>Monthly income, today&rsquo;s dollars</span><b>{signed(plan.incomeToday - keep.incomeToday)}</b></li>
          </ul>}
        </section>}
      </div>}
    </>
  );
}

/* ── Top-ups and tax ──────────────────────────────────────────────────────── */
export function TopUpsView({ answers, plan, tried, setTried, setAnswer, now }) {
  const [budget, setBudget] = useState(8000);
  const t = useMemo(() => compareTopUps(answers, now, budget), [answers, now, budget]);
  const rejected = plan.rows.find((r) => r.topUpNotAccepted > 0);
  const names = { own: `Top up your own ${t.options[0].account}`, partner: 'Top up your partner’s CPF', srs: 'Pay into SRS' };
  const inPlan = { own: (tried.topUpYearly ?? answers.topUpYearly) > 0, partner: answers.pTopUpYearly > 0 };
  return (
    <>
      <section className="lead compact">
        <p className="eyebrow">Top-ups and tax</p>
        <h1>Where should spare cash go?</h1>
        <p className="muted">Each option is shown on its own for the yearly amount you set. On pay of about {money(t.chargeable)} a year after CPF, each extra dollar of relief saves you about {Math.round(t.marginalRate * 100)} cents in tax.</p>
      </section>

      <section className="panel">
        <Slider id="tu-budget" label="Spare cash each year" value={budget} min={0} max={30000} step={500} onChange={setBudget} format={money} />
      </section>

      <ol className="moves">
        {t.options.map((o) => (
          <li key={o.key} className={`panel move ${inPlan[o.key] ? 'on' : ''}`}>
            <span className="rank" aria-hidden="true">{o.key === 'srs' ? 'S' : 'C'}</span>
            <div className="move-body">
              <h2>{names[o.key]}</h2>
              <p className="gain-line"><b className="gain">{money(o.taxSaved)} tax saved a year</b><span className="muted"> · on {money(o.amount)} put in</span></p>
              <dl>
                {o.key !== 'srs' && <div><dt>You get</dt><dd>About {money(Math.max(0, o.gainToday))} a month more{o.key === 'partner' ? ' for your partner' : ''} in retirement, in today&rsquo;s dollars</dd></div>}
                {o.key === 'srs' && <div><dt>You get</dt><dd>About {money(o.valueAt63Today)} at 63 in today&rsquo;s dollars, if invested at {answers.srsReturn}% a year for {o.years} years</dd></div>}
                <div><dt>Relief</dt><dd>{o.key === 'srs' ? `On up to ${money(SRS_CAP_SC_PR)} a year` : `On the first ${money(RSTU_RELIEF_CAP)} a year, and only on top-ups up to the Full Retirement Sum`}</dd></div>
                <div><dt>The catch</dt><dd>{o.key === 'own' ? 'Cannot be withdrawn. It comes back as monthly payouts.'
                  : o.key === 'partner' ? 'Cannot be withdrawn. Tax relief applies only if your partner’s income is low; check the limit with IRAS.'
                    : 'Half of each withdrawal is taxed. Withdrawing before the retirement age costs a 5% penalty and is fully taxed. Uninvested SRS cash earns almost nothing.'}</dd></div>
              </dl>
            </div>
            {o.key === 'own' && <button type="button" className={`btn ${inPlan.own ? 'btn-secondary' : 'btn-primary'}`} onClick={() => setTried((x) => { const n = { ...x }; if (inPlan.own) delete n.topUpYearly; else n.topUpYearly = o.amount; return n; })}>{inPlan.own ? 'Remove from plan' : 'Try in my plan'}</button>}
            {o.key === 'partner' && <button type="button" className={`btn ${inPlan.partner ? 'btn-secondary' : 'btn-primary'}`} onClick={() => setAnswer({ pTopUpYearly: inPlan.partner ? 0 : o.amount })}>{inPlan.partner ? 'Remove from plan' : 'Add to household plan'}</button>}
          </li>
        ))}
      </ol>

      {rejected && <section className="panel watch" role="note"><h2><span aria-hidden="true">⚠ </span>Top-up limit</h2><p>From age {rejected.age}, CPF would not accept all of your planned top-up, because your account reaches the {rejected.age < 55 ? 'Full' : 'Enhanced'} Retirement Sum. The amount turned away is left out of your plan.</p></section>}

      <section className="panel assumptions">
        <h2>Good to know</h2>
        <ul>
          <li>The most relief these three can give you is {money(t.maxRelief)} a year. All personal reliefs together are capped at S$80,000 a year.</li>
          <li>Tax here is estimated from your pay, employee CPF and earned-income relief only. Other reliefs you claim will lower the saving.</li>
          <li>SRS is shown for comparison and is not added to your plan&rsquo;s monthly income.</li>
          <li>Top-ups matched by the Government under the Matched Retirement Savings Scheme are not included here.</li>
        </ul>
        <label className="fld slider" htmlFor="tu-return"><span className="field-label">SRS investment return<output>{answers.srsReturn}%</output></span>
          <input id="tu-return" type="range" min={0} max={7} step={0.5} value={answers.srsReturn} onChange={(e) => setAnswer({ srsReturn: Number(e.target.value) })} /></label>
      </section>
    </>
  );
}

/* ── Confidence (Monte Carlo) ─────────────────────────────────────────────── */
export function ConfidenceView({ answers, plan, now }) {
  const [band, setBand] = useState(1);
  const [result, setResult] = useState(null);
  const key = JSON.stringify(plan.answers) + band;
  const r = result && result.key === key ? result.data : null;
  const run = () => setResult({ key, data: runConfidence(plan.answers, now, { runs: 500, band }) });
  const max = r ? Math.max(...r.hist.map((h) => h.count)) : 1;
  return (
    <>
      <section className="lead compact">
        <p className="eyebrow">Confidence</p>
        <h1>{r ? <>In 8 of 10 simulated futures, your income lands between <span className="fig">{money(r.income.p10)}</span> and <span className="fig">{money(r.income.p90)}</span> a month.</> : 'How sure is this number?'}</h1>
        <p className="muted">Your plan is run 500 times with CPF interest moving up or down each year. CPF rates have legal minimums, so the low end is deliberately cautious.</p>
      </section>

      <section className="panel">
        <div className="save-row">
          <Choice label="How far interest can move each year" name="band" value={band} onChange={setBand} options={[[0.5, '± 0.5 points'], [1, '± 1 point'], [1.5, '± 1.5 points']]} />
          <button type="button" className="btn btn-primary" onClick={run}>{r ? 'Run again' : 'Run 500 simulations'}</button>
        </div>
        {result && !r && <p className="field-hint">Your plan has changed since the last run. Run it again for current figures.</p>}
      </section>

      {r && <>
        <div className="grid3">
          <section className="panel kpi"><p className="eyebrow">Cautious</p><p className="mod-fig fig">{money(r.income.p10)}</p><p className="small muted">9 in 10 runs did better than this</p></section>
          <section className="panel kpi"><p className="eyebrow">Middle</p><p className="mod-fig fig">{money(r.income.p50)}</p><p className="small muted">Your plan shows {money(plan.incomeToday)}</p></section>
          <section className="panel kpi"><p className="eyebrow">Favourable</p><p className="mod-fig fig">{money(r.income.p90)}</p><p className="small muted">1 in 10 runs did better than this</p></section>
        </div>
        <section className="panel">
          <h2>Spread of monthly income across 500 runs</h2>
          <div className="hist" role="img" aria-label={`Histogram of monthly income from ${money(r.income.min)} to ${money(r.income.max)}; most runs fall near ${money(r.income.p50)}.`}>
            {r.hist.map((h) => <span key={h.from} title={`${money(h.from)} to ${money(h.to)}: ${h.count} runs`} style={{ height: `${Math.max(2, (h.count / max) * 100)}%` }} />)}
          </div>
          <div className="hist-axis"><span>{money(r.income.min)} lowest</span><span>{money(r.income.max)} highest</span></div>
          <ul className="delta-list">
            <li><span>CPF LIFE alone: cautious to favourable</span><b>{money(r.life.p10)} to {money(r.life.p90)}</b></li>
            {r.chanceTarget !== null && <li><span>Runs that met your target of {money(plan.target)}</span><b>{pct(r.chanceTarget)}</b></li>}
            {r.chanceFrs !== null && <li><span>Runs that reached the Full Retirement Sum at 55</span><b>{pct(r.chanceFrs)}</b></li>}
          </ul>
          <p className="small muted">Monthly income in today&rsquo;s dollars. The same plan always gives the same range. This tests interest rates only; your pay, health and property prices can also change. {answers.hasPartner ? 'Figures are for you, not your household.' : ''}</p>
        </section>
      </>}
    </>
  );
}
