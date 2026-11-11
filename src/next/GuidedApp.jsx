/**
 * Guided planner (/app/) — the first screen answers one question: "what will CPF pay me, and is it enough?"
 *
 * Structure: access code → 5-step setup (8 questions) → four views:
 *   Plan (the answer) · Moves (what to do next) · Details (how the number is built) · Profile (your answers)
 * All figures come from src/model/plan.js. Nothing is sent anywhere; the plan is saved on this device.
 */
import { useEffect, useMemo, useState } from 'react';
import { buildPlan, findMoves, DEFAULT_ANSWERS, ageFrom, RSTU_RELIEF_CAP } from '../model/plan.js';
import { tierForAnyCode } from '../entitlements/gate.js';
import { tierName, PLAN_RANK } from '../entitlements/tiers.js';
import { loadPlan, savePlan, clearPlan, currentTier, rememberTier, getTheme, setTheme, classicLink, loadBook, saveBook, newId, signOut } from './storage.js';
import { VERSION_LABEL } from '../version.js';
import SavingsChart from './Chart.jsx';
import { money, pct, Help, MoneyField, Choice, Slider } from './ui.jsx';
import { CompareView, WorkspaceDetails, Assumptions, ClientsView, ReportView, UpgradeCode, PreviewSwitch } from './Workspace.jsx';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const LIFE_PLANS = [
  { id: 'std', name: 'Standard', note: 'Level payouts for life. The default.' },
  { id: 'esc', name: 'Escalating', note: 'Starts about 20% lower, then rises 2% a year to keep up with prices.' },
  { id: 'bas', name: 'Basic', note: 'Lower payouts that fall later in life; leaves more for your family.' },
];
const WHAT_IF_KEYS = ['topUpYearly', 'oaToSaYearly', 'payoutAge', 'stopWorkAge', 'housingMonthly'];

/* ── The questions (used by setup and by Profile) ─────────────────────────── */
function Questions({ step, a, set, age }) {
  const years = []; for (let y = new Date().getFullYear() - 16; y >= 1936; y--) years.push(y);
  const at55 = age >= 55;
  if (step === 0) return (<>
    <div className="row2">
      <label className="fld" htmlFor="q-month"><span className="field-label">Birth month</span>
        <select id="q-month" value={a.birthMonth} onChange={(e) => set({ birthMonth: Number(e.target.value) })}>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select></label>
      <label className="fld" htmlFor="q-year"><span className="field-label">Birth year</span>
        <select id="q-year" value={a.birthYear} onChange={(e) => set({ birthYear: Number(e.target.value) })}>{years.map((y) => <option key={y}>{y}</option>)}</select></label>
    </div>
    <Choice label="Sex (CPF LIFE payouts differ for men and women)" name="sex" value={a.isMale} onChange={(v) => set({ isMale: v })} options={[[true, 'Male'], [false, 'Female']]} />
    <Choice label="Status" name="status" value={a.status} onChange={(v) => set({ status: v })}
      options={[['SC', 'Citizen'], ['PR3', 'PR, 3rd year on'], ['PR2', 'PR, 2nd year'], ['PR1', 'PR, 1st year']]} />
  </>);
  if (step === 1) return (<>
    <Choice label="How do you work?" name="work" value={a.work} onChange={(v) => set({ work: v })} options={[['employee', 'Employee'], ['self', 'Self-employed'], ['none', 'Not working']]} />
    {a.work === 'employee' && <>
      <MoneyField id="q-salary" label="Monthly salary before CPF" value={a.salary} onChange={(v) => set({ salary: v })} hint="CPF is paid on the first S$8,000 a month." />
      <Slider id="q-bonus" label="Yearly bonus" value={a.bonusMonths} min={0} max={6} step={0.5} onChange={(v) => set({ bonusMonths: v })} format={(v) => `${v} month${v === 1 ? '' : 's'}`} />
    </>}
    {a.work === 'self' && <MoneyField id="q-trade" label="Yearly net trade income" value={a.tradeIncome} onChange={(v) => set({ tradeIncome: v })} hint="Self-employed people must contribute to MediSave only. Other CPF savings are voluntary." />}
  </>);
  if (step === 2) return (<>
    <p className="field-hint lead-hint">Find these in the CPF mobile app or at cpf.gov.sg after logging in with Singpass. Round figures are fine.</p>
    <MoneyField id="q-oa" label="Ordinary Account (OA)" value={a.oa} onChange={(v) => set({ oa: v })} />
    <MoneyField id="q-sa" label={at55 ? 'Retirement Account (RA)' : 'Special Account (SA)'} value={a.sa} onChange={(v) => set({ sa: v })}
      hint={at55 ? 'From 55 your Special Account is closed and its savings are in the Retirement Account.' : null} />
    <MoneyField id="q-ma" label="MediSave Account (MA)" value={a.ma} onChange={(v) => set({ ma: v })} />
  </>);
  if (step === 3) return (<>
    <MoneyField id="q-house" label="Home loan paid from your Ordinary Account" value={a.housingMonthly} onChange={(v) => set({ housingMonthly: v })} suffix="a month"
      hint="Your share only. Leave at 0 if you pay in cash, rent, or have no loan." />
    {a.housingMonthly > 0 && <Slider id="q-house-end" label="Loan ends when you are" value={Math.max(a.housingEndAge, age)} min={age} max={Math.max(75, age)} step={1} onChange={(v) => set({ housingEndAge: v })} format={(v) => `${v}`} />}
  </>);
  return (<>
    <MoneyField id="q-target" label="Monthly income you want in retirement" value={a.targetIncome} onChange={(v) => set({ targetIncome: v })} suffix="in today's dollars"
      hint="Not sure? A common starting point is two-thirds of what you spend each month now." />
    <Slider id="q-payout" label="Start CPF LIFE payouts at" value={a.payoutAge} min={65} max={70} step={1} onChange={(v) => set({ payoutAge: v })} format={(v) => `${v}`} />
    <p className="field-hint">Payouts can start any time from 65 to 70. Each year you wait raises them by up to 7%.</p>
  </>);
}
const STEPS = [
  ['About you', 'Age and sex set contribution rates and CPF LIFE payouts.'],
  ['Your work', 'This sets how much goes into CPF each month.'],
  ['Your CPF today', 'Your three account balances.'],
  ['Your home', 'Money used for a home loan is not there for retirement.'],
  ['Your goal', 'What you want CPF to pay you.'],
];

/* ── Access ───────────────────────────────────────────────────────────────── */
function Gate({ onPass }) {
  const [code, setCode] = useState(''), [bad, setBad] = useState(false);
  const submit = (e) => {
    e.preventDefault();
    const tier = tierForAnyCode(code.trim());
    if (tier) { rememberTier(tier); onPass(tier); } else setBad(true);
  };
  return (
    <main className="gate">
      <form className="panel gate-card" onSubmit={submit}>
        <span className="brand-mark" aria-hidden="true">富</span>
        <h1>Fusion planner</h1>
        <p className="muted">Private beta. Enter the access code from your invitation.</p>
        <label className="fld" htmlFor="gate-code"><span className="field-label">Access code</span>
          <input id="gate-code" type="password" autoComplete="off" value={code} onChange={(e) => { setCode(e.target.value); setBad(false); }} aria-invalid={bad} /></label>
        {bad && <p className="error" role="alert">That code was not recognised. Check for extra spaces and capital letters.</p>}
        <button className="btn btn-primary btn-block" type="submit">Continue</button>
        <p className="small muted">No code? <a href="/contact/">Ask for an invitation</a>.</p>
        <p className="small muted app-foot">Fusion 富生 {VERSION_LABEL}</p>
      </form>
    </main>
  );
}

/* ── Setup ────────────────────────────────────────────────────────────────── */
function Setup({ answers, onDone, title }) {
  const [a, setA] = useState(answers), [step, setStep] = useState(0);
  const set = (patch) => setA((p) => ({ ...p, ...patch }));
  const { age } = ageFrom(a.birthYear, a.birthMonth);
  const last = step === STEPS.length - 1;
  const next = (e) => {
    e.preventDefault();
    if (!last) { setStep(step + 1); window.scrollTo(0, 0); return; }
    onDone({ ...a, housingEndAge: Math.max(a.housingEndAge, age), stopWorkAge: Math.max(65, age), work: a.work });
  };
  return (
    <main className="setup">
      <form className="panel setup-card" onSubmit={next}>
        <ol className="progress" aria-label="Setup progress">
          {STEPS.map(([t], i) => <li key={t} className={i === step ? 'now' : i < step ? 'done' : ''} aria-current={i === step ? 'step' : undefined}><span className="visually-hidden">{t}</span></li>)}
        </ol>
        <p className="eyebrow">{title ? `${title} · ` : ''}Step {step + 1} of {STEPS.length}</p>
        <h1>{STEPS[step][0]}</h1>
        <p className="muted">{STEPS[step][1]}</p>
        <div className="fields"><Questions step={step} a={a} set={set} age={age} /></div>
        <div className="btn-row setup-nav">
          {step > 0 && <button type="button" className="btn btn-secondary" onClick={() => setStep(step - 1)}>Back</button>}
          <button type="submit" className="btn btn-primary">{last ? 'Show my plan' : 'Next'}</button>
        </div>
        <p className="small muted privacy">Your answers stay on this device. Nothing is uploaded.</p>
      </form>
    </main>
  );
}

/* ── Plan ─────────────────────────────────────────────────────────────────── */
function IncomeBar({ plan }) {
  const scale = Math.max(plan.target, plan.incomeToday, 1);
  const w = (v) => `${Math.max(0, (v / scale) * 100)}%`;
  return (
    <div className="income">
      <div className="bar" role="img" aria-label={`CPF LIFE ${money(plan.payoutToday)} a month, Ordinary Account ${money(plan.oaMonthlyToday)} a month${plan.gapToday > 0 ? `, gap ${money(plan.gapToday)} a month` : ''}`}>
        <span className="seg-life" style={{ width: w(plan.payoutToday) }} />
        {plan.oaMonthlyToday > 0 && <span className="seg-oa" style={{ width: w(plan.oaMonthlyToday) }} />}
        {plan.gapToday > 0 && <span className="seg-gap" style={{ width: w(plan.gapToday) }} />}
        {plan.target > 0 && <i className="target" style={{ left: w(plan.target) }} />}
      </div>
      <ul className="bar-key">
        <li><i className="sw life" /><span><b>{money(plan.payoutToday)}</b> CPF LIFE <em>for life</em></span></li>
        {plan.oaMonthlyToday > 0 && <li><i className="sw oa" /><span><b>{money(plan.oaMonthlyToday)}</b> Ordinary Account <em>if spread to age 90</em></span></li>}
        {plan.gapToday > 0 && <li><i className="sw gap" /><span><b>{money(plan.gapToday)}</b> gap <em>from other savings</em></span></li>}
      </ul>
    </div>
  );
}

function PlanView({ plan, moves, changed, onReset, go }) {
  const started = plan.age >= plan.payoutAge;
  const enough = plan.target > 0 && plan.gapToday === 0;
  const top = moves[0];
  return (
    <>
      <section className="lead">
        <p className="eyebrow">Your plan · age {plan.age}</p>
        <h1>{started ? 'CPF LIFE' : `From ${plan.payoutAge}, CPF LIFE`} is set to pay you about <span className="fig">{money(plan.payoutToday)}</span> a month for life.</h1>
        <p className="muted">In today&rsquo;s dollars.{!started && <> On paper, {money(plan.payout)} a month in {plan.yearPayout}.</>} <Help to="cpf-life">How CPF LIFE works</Help></p>
        {changed > 0 && <p className="whatif-note"><span>Includes {changed} what-if change{changed > 1 ? 's' : ''}.</span> <button type="button" className="link" onClick={onReset}>Back to my starting plan</button></p>}
      </section>

      <div className="grid2">
        <section className="panel">
          <h2>{plan.target > 0 ? `Against the ${money(plan.target)} a month you want` : 'Your monthly income from CPF'}</h2>
          <IncomeBar plan={plan} />
          {plan.target > 0 && <p className={`verdict ${enough ? 'ok' : 'short'}`}>
            {enough ? `CPF covers your target${plan.payoutToday >= plan.target ? ' with CPF LIFE alone' : ', counting your Ordinary Account savings'}.`
              : `CPF covers ${Math.floor(plan.coverage * 100)}% of your target. You are short by ${money(plan.gapToday)} a month.`}
          </p>}
        </section>

        <section className="panel score-card">
          <h2>Readiness</h2>
          <div className="score"><span className="fig">{plan.score}</span><span className="of">/ 100</span><span className={`label l-${plan.label.split(' ')[0].toLowerCase()}`}>{plan.label}</span></div>
          <ul className="parts">
            {plan.parts.map((p) => (
              <li key={p.key}><span>{p.label}</span><span className="meter" aria-hidden="true"><i style={{ width: pct(p.value) }} /></span><b>{pct(p.value)}</b></li>
            ))}
          </ul>
        </section>
      </div>

      {plan.watch[0] && <section className="panel watch" role="note"><h2><span aria-hidden="true">⚠ </span>Watch out</h2><p>{plan.watch[0].text}</p></section>}

      <section className="panel next">
        {top ? (<>
          <div><p className="eyebrow">Your biggest move</p><h2>{top.title}</h2><p className="muted">Adds about <b className="gain">{money(top.gain)} a month</b>. {top.cost}.</p></div>
          <button type="button" className="btn btn-primary" onClick={() => go('moves')}>See your next moves</button>
        </>) : (<>
          <div><h2>No obvious quick wins</h2><p className="muted">Try the levers yourself to see what changes your income.</p></div>
          <button type="button" className="btn btn-primary" onClick={() => go('moves')}>Try what-ifs</button>
        </>)}
      </section>
    </>
  );
}

/* ── Moves ────────────────────────────────────────────────────────────────── */
function MovesView({ base, plan, moves, tried, setTried, answers }) {
  const delta = plan.incomeToday - base.incomeToday;
  const isOn = (m) => Object.keys(m.change).every((k) => tried[k] === m.change[k]);
  const toggle = (m) => setTried((t) => {
    const n = { ...t };
    if (isOn(m)) Object.keys(m.change).forEach((k) => delete n[k]); else Object.assign(n, m.change);
    return n;
  });
  const lever = (k, v) => setTried((t) => { const n = { ...t }; if (v === answers[k]) delete n[k]; else n[k] = v; return n; });
  const val = (k) => (tried[k] !== undefined ? tried[k] : answers[k]);
  const working = answers.work !== 'none';
  return (
    <>
      <section className="lead compact">
        <p className="eyebrow">Next moves</p>
        <h1>Three things that would raise your retirement income most.</h1>
        <p className="muted">Each figure is that move on its own, in today&rsquo;s dollars. Try them to see the combined effect. Nothing is changed in your CPF.</p>
      </section>

      <div className="result-bar" aria-live="polite">
        <span>Monthly income with your choices</span>
        <b className="fig">{money(plan.incomeToday)}</b>
        <span className={delta > 0 ? 'gain' : 'muted'}>{delta === 0 ? 'your starting plan' : `${delta > 0 ? '+' : '−'}${money(Math.abs(delta))} vs your starting plan`}</span>
        {Object.keys(tried).length > 0 && <button type="button" className="link" onClick={() => setTried({})}>Reset</button>}
      </div>

      <ol className="moves">
        {moves.map((m, i) => (
          <li key={m.key} className={`panel move ${isOn(m) ? 'on' : ''}`}>
            <span className="rank" aria-hidden="true">{i + 1}</span>
            <div className="move-body">
              <h2>{m.title}</h2>
              <p className="gain-line"><b className="gain">+{money(m.gain)} a month</b>{m.lifeGain >= 10 && m.lifeGain < m.gain - 10 ? <span className="muted"> · {money(m.lifeGain)} of it for life</span> : null}</p>
              <dl>
                <div><dt>Cost</dt><dd>{m.cost}</dd></div>
                {m.bonus && <div><dt>Also</dt><dd>{m.bonus}</dd></div>}
                <div><dt>The catch</dt><dd>{m.catch}</dd></div>
              </dl>
            </div>
            <button type="button" className={`btn ${isOn(m) ? 'btn-secondary' : 'btn-primary'}`} aria-pressed={isOn(m)} onClick={() => toggle(m)}>{isOn(m) ? 'Undo' : 'Try it'}</button>
          </li>
        ))}
        {moves.length === 0 && <li className="panel"><p>No single move adds S$10 a month or more. Use the levers below.</p></li>}
      </ol>

      <section className="panel levers">
        <h2>Adjust it yourself</h2>
        <div className="fields">
          <Slider id="l-topup" label={`Cash top-up to your ${base.age < 55 ? 'Special' : 'Retirement'} Account each year`} value={val('topUpYearly')} min={0} max={16000} step={500} onChange={(v) => lever('topUpYearly', v)} format={money} />
          <p className="field-hint">The first {money(RSTU_RELIEF_CAP)} a year earns income tax relief. Top-ups cannot be withdrawn. <Help to="playbook">Top-up rules</Help></p>
          <Slider id="l-payout" label="Start CPF LIFE payouts at" value={val('payoutAge')} min={65} max={70} step={1} onChange={(v) => lever('payoutAge', v)} format={(v) => `${v}`} />
          {working && <Slider id="l-work" label="Work until" value={Math.max(val('stopWorkAge'), base.age)} min={Math.max(55, base.age)} max={75} step={1} onChange={(v) => lever('stopWorkAge', v)} format={(v) => `${v}`} />}
        </div>
      </section>
    </>
  );
}

/* ── Details ──────────────────────────────────────────────────────────────── */
function DetailsView({ plan, setAnswer, tier, onReport }) {
  const a = plan.assumptions, before55 = plan.age < 55, started = plan.age >= plan.payoutAge;
  return (
    <>
      <section className="lead compact">
        <p className="eyebrow">How the number is built</p>
        <h1>Your CPF, from today to your first payout.</h1>
      </section>

      <ol className="journey">
        <li className="panel"><p className="eyebrow">Today · age {plan.age}</p><p className="big fig">{money(plan.totalNow)}</p>
          <p>across your three accounts. {plan.answers.work === 'none' ? 'It keeps earning interest of 2.5% to 4% a year.' : 'Contributions and interest of 2.5% to 4% a year build on this.'}</p></li>
        <li className="panel"><p className="eyebrow">{before55 ? `At 55 · ${plan.year55}` : `At 55 · ${plan.year55} (past)`}</p><p className="big fig">{pct(plan.frsCoverage)}</p>
          <p>of the Full Retirement Sum ({money(plan.frs55)} for your year){before55 ? ' is set aside in a new Retirement Account. Savings above it stay in your Ordinary Account and can be withdrawn.' : ' is the level your Retirement Account is at now.'} <Help to="numbers">Retirement sums</Help></p></li>
        <li className="panel"><p className="eyebrow">{started ? 'Payouts' : `At ${plan.payoutAge} · ${plan.yearPayout}`}</p><p className="big fig">{money(plan.payoutToday)}<small> a month</small></p>
          <p>from CPF LIFE, for as long as you live{started ? '' : `. Your Retirement Account is projected to hold ${money(plan.raAtPayout)} by then (${plan.yearPayout} dollars)`}.</p></li>
      </ol>

      {plan.series.length > 1 && <section className="panel">
        <h2>How your savings build up{started ? '' : ` to ${plan.payoutAge}`}</h2>
        <SavingsChart series={plan.series} marks={before55 ? [{ age: 55, label: '55: Retirement Account opens' }] : []} />
      </section>}

      <section className="panel">
        <h2>Choose your CPF LIFE plan</h2>
        <p className="muted">First-month payout in today&rsquo;s dollars. You choose when payouts start, not now. <Help to="cpf-life">Compare the plans</Help></p>
        <div className="lifeplans" role="radiogroup" aria-label="CPF LIFE plan">
          {LIFE_PLANS.map((p) => {
            const v = plan.payouts[p.id] * (plan.payout > 0 ? plan.payoutToday / plan.payout : 1);
            return (
              <label key={p.id} className={plan.answers.lifePlan === p.id ? 'on' : ''}>
                <input type="radio" name="lifeplan" checked={plan.answers.lifePlan === p.id} onChange={() => setAnswer({ lifePlan: p.id })} />
                <span className="plan-name">{p.name}</span><b className="fig">{money(v)}</b><span className="small muted">{p.note}</span>
              </label>
            );
          })}
        </div>
      </section>

      <WorkspaceDetails plan={plan} tier={tier} onReport={onReport} />

      <section className="panel assumptions">
        <h2>What this assumes</h2>
        <ul>
          <li>Prices rise {(a.inflation * 100).toFixed(1)}% a year, and your pay rises at the same rate until you stop work.</li>
          <li>Interest stays at today&rsquo;s rates: 2.5% on the Ordinary Account and 4% on Special, MediSave and Retirement Accounts, plus extra interest on the first S$60,000.</li>
          <li>Retirement sums are the published figures for 2026 and 2027, then rise {(a.sumGrowth * 100).toFixed(1)}% a year.</li>
          <li>Contribution rates are those in force from 1 January 2026, with the announced 2027 increase for ages 55 to 65.</li>
          <li>CPF LIFE payouts are estimates matched to CPF Board&rsquo;s published figures. The Board sets your actual payout when it starts.</li>
          <li>Ordinary Account income assumes you spread those savings evenly to age {90}. It is your choice, and it is not guaranteed for life.</li>
        </ul>
        <p className="small muted">Rules and figures are checked against <a href="https://www.cpf.gov.sg/member" target="_blank" rel="noopener">CPF Board</a>, <a href="https://www.iras.gov.sg" target="_blank" rel="noopener">IRAS</a> and <a href="https://www.moh.gov.sg" target="_blank" rel="noopener">Ministry of Health</a> publications. This is an estimate for planning, not financial advice and not a statement from CPF Board.</p>
      </section>
    </>
  );
}

/* ── Profile ──────────────────────────────────────────────────────────────── */
function ProfileView({ answers, setAnswer, onRestart, tier, ownTier, onTier, onPreview }) {
  const { age } = ageFrom(answers.birthYear, answers.birthMonth);
  return (
    <>
      <section className="lead compact">
        <p className="eyebrow">Your answers</p>
        <h1>Change anything and your plan updates straight away.</h1>
      </section>
      <div className="profile">
        {STEPS.map(([title], i) => (
          <section className="panel" key={title}><h2>{title}</h2><div className="fields"><Questions step={i} a={answers} set={setAnswer} age={age} /></div></section>
        ))}
      </div>
      <Assumptions answers={answers} setAnswer={setAnswer} tier={tier} />
      <section className="panel more">
        <h2>Need more detail?</h2>
        <p className="muted">The classic planner has every table and chart: property, insurance, family, tax and stress tests. It opens in a new tab with this plan loaded.</p>
        <div className="btn-row">
          <a className="btn btn-secondary" href={classicLink(answers)} target="_blank" rel="noopener">Open in classic planner ↗</a>
          <button type="button" className="btn btn-ghost danger" onClick={onRestart}>Erase and start again</button>
        </div>
        <p className="small muted">Saved on this device only. Clearing your browser data removes it.</p>
      </section>
      <PreviewSwitch tier={tier} ownTier={ownTier} onPreview={onPreview} />
      <UpgradeCode tier={ownTier} onTier={onTier} />
    </>
  );
}

/* ── Shell ────────────────────────────────────────────────────────────────── */
const TABS = [['plan', 'Plan'], ['moves', 'Moves'], ['details', 'Details'], ['compare', 'Compare'], ['profile', 'Profile']];
const ICONS = {
  plan: 'M3 12l9-8 9 8M5 10v10h14V10', moves: 'M4 18l6-6 4 4 6-8M14 8h6v6', details: 'M4 20V10M10 20V4M16 20v-8M22 20H2',
  compare: 'M4 5h6v14H4zM14 5h6v14h-6z', profile: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0',
};
const EMPTY = { answers: DEFAULT_ANSWERS, tried: {}, done: false, scenarios: [] };

export default function GuidedApp() {
  // `ownTier` is what this device has unlocked. `preview` lets Workspace and Adviser users look at a
  // lower plan; it lasts until the page is reloaded and never changes saved plans or client files.
  const [ownTier, setTier] = useState(currentTier);
  const [preview, setPreview] = useState(null);
  const tier = preview && PLAN_RANK[preview] < PLAN_RANK[ownTier] ? preview : ownTier;
  // Adviser: `book` holds the client files; `clientId` is the open one (null = the adviser's own plan).
  const [book, setBook] = useState(loadBook);
  const [clientId, setClientId] = useState(null);
  const [state, setState] = useState(() => loadPlan() || EMPTY);
  const [tab, setTab] = useState('plan');
  const [theme, setThemeState] = useState(getTheme);
  const { answers, tried, done, scenarios } = state;
  const client = clientId ? book.clients.find((c) => c.id === clientId) : null;

  // Autosave: to the open client file, or to the personal plan.
  useEffect(() => {
    if (!done) return;
    if (clientId) setBook((b) => ({ ...b, clients: b.clients.map((c) => (c.id === clientId ? { ...c, state, updated: new Date().toISOString() } : c)) }));
    else savePlan(state);
  }, [state, done, clientId]);
  useEffect(() => { saveBook(book); }, [book]);
  useEffect(() => { window.scrollTo(0, 0); }, [tab]);

  const now = useMemo(() => new Date(), []);
  const { base, moves } = useMemo(() => (done ? findMoves(answers, now) : { base: null, moves: [] }), [answers, done, now]);
  const changed = WHAT_IF_KEYS.filter((k) => tried[k] !== undefined && tried[k] !== answers[k]).length;
  const plan = useMemo(() => (done ? (changed ? buildPlan({ ...answers, ...tried }, now) : base) : null), [answers, tried, done, base, changed, now]);

  if (!ownTier) return <Gate onPass={setTier} />;

  const setAnswer = (patch) => setState((s) => ({ ...s, answers: { ...s.answers, ...patch }, tried: {} }));
  const setTried = (fn) => setState((s) => ({ ...s, tried: typeof fn === 'function' ? fn(s.tried) : fn }));
  const setScenarios = (fn) => setState((s) => ({ ...s, scenarios: fn(s.scenarios || []) }));
  const restart = () => {
    if (!window.confirm(client ? `Erase the answers in ${client.name}'s file and start again?` : 'Erase your answers on this device and start again?')) return;
    if (!clientId) clearPlan();
    setState(EMPTY); setTab('plan');
  };
  const flip = () => { const m = theme === 'dark' ? 'light' : 'dark'; setTheme(m); setThemeState(m); };
  const upgrade = (t) => { rememberTier(t); setTier(t); };
  const openClient = (id) => {
    const c = id ? book.clients.find((x) => x.id === id) : null;
    setClientId(id || null); setState(c ? c.state : loadPlan() || EMPTY); setTab('plan');
  };
  const addClient = (name) => {
    const c = { id: newId(), name, notes: '', updated: new Date().toISOString(), state: EMPTY };
    setBook((b) => ({ ...b, clients: [...b.clients, c] })); setClientId(c.id); setState(EMPTY); setTab('plan');
  };
  const pro = tier === 'pro';
  const showTabs = done && tab !== 'clients' && tab !== 'report';

  return (
    <div className="app">
      <header className="app-header">
        <div className="wrap">
          <a className="brand" href="/" aria-label="Fusion 富生 home"><span className="brand-mark" aria-hidden="true">富</span><span className="brand-name">Fusion</span></a>
          {done && tab !== 'report' && <nav className="tabs" aria-label="Planner">
            {TABS.map(([id, label]) => (
              <button key={id} type="button" className={tab === id ? 'on' : ''} aria-current={tab === id ? 'page' : undefined} onClick={() => setTab(id)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICONS[id]} /></svg>{label}
              </button>
            ))}
          </nav>}
          <div className="header-actions">
            {pro
              ? <button type="button" className={`client-btn ${tab === 'clients' ? 'on' : ''}`} onClick={() => setTab('clients')}><span className="visually-hidden">Client file: </span>{client ? client.name : 'My plan'} ▾</button>
              : <span className="pill">{tierName(tier)}</span>}
            <button type="button" className="icon-btn" onClick={flip} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                {theme === 'dark' ? <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></> : <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />}
              </svg>
            </button>
            <button type="button" className="icon-btn" onClick={signOut} aria-label="Sign out" title="Sign out">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></svg>
            </button>
          </div>
        </div>
      </header>

      {pro && tab === 'clients' ? (
        <main className="wrap main" id="main">
          <ClientsView book={book} setBook={setBook} clientId={clientId} onOpen={openClient} onAdd={addClient} onClose={() => setTab('plan')}
            onDeleted={(id) => { if (id === clientId) openClient(null); }} />
        </main>
      ) : !done ? (
        <Setup key={clientId || 'me'} answers={answers} title={client ? `Setting up ${client.name}'s plan` : null} onDone={(a) => setState((s) => ({ ...s, answers: a, tried: {}, done: true }))} />
      ) : (
        <main className={`wrap main ${showTabs ? '' : 'no-tabs'}`} id="main">
          {tier !== ownTier && <p className="preview-note no-print" role="status"><span>Previewing the <b>{tierName(tier)}</b> plan{client ? ` with ${client.name}'s file open` : ''}.</span> <button type="button" className="link" onClick={() => setPreview(null)}>Back to {tierName(ownTier)}</button></p>}
          {tab === 'plan' && <PlanView plan={plan} moves={moves} changed={changed} onReset={() => setTried({})} go={setTab} />}
          {tab === 'moves' && <MovesView base={base} plan={plan} moves={moves} tried={tried} setTried={setTried} answers={answers} />}
          {tab === 'details' && <DetailsView plan={plan} tier={tier} onReport={() => setTab('report')} setAnswer={(p) => setState((s) => ({ ...s, answers: { ...s.answers, ...p } }))} />}
          {tab === 'compare' && <CompareView tier={tier} base={base} plan={plan} answers={answers} tried={tried} changed={changed} scenarios={scenarios || []} setScenarios={setScenarios} setTried={setTried} now={now} go={setTab} />}
          {tab === 'profile' && <ProfileView answers={answers} setAnswer={setAnswer} onRestart={restart} tier={tier} ownTier={ownTier} onTier={upgrade} onPreview={(t) => { setPreview(t === ownTier ? null : t); if (tab === 'clients' || tab === 'report') setTab('plan'); }} />}
          {tab === 'report' && <ReportView plan={plan} base={base} answers={answers} scenarios={scenarios || []} now={now} tier={tier} client={client} adviser={book.adviser}
            setNotes={(notes) => setBook((b) => ({ ...b, clients: b.clients.map((c) => (c.id === clientId ? { ...c, notes } : c)) }))} onBack={() => setTab('details')} />}
        </main>
      )}
      <footer className="app-foot no-print">
        <span>Fusion 富生 {VERSION_LABEL}</span>
        <button type="button" className="link" onClick={signOut}>Sign out</button>
      </footer>
    </div>
  );
}
