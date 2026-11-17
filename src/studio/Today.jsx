/** Chapter 1, Today: where the user stands now and where that leads. Figures from todayScene. */
import { useMemo } from 'react';
import { todayScene } from '../model/studio.js';
import { RULES_VERSION } from '../policy/cpf2026.js';
import { MoneyField, money } from '../next/ui.jsx';
import { Scene, GapPill, ShowHow, SceneNav } from './shared.jsx';

const PLAN_NAMES = { std: 'Standard', esc: 'Escalating', bas: 'Basic' };

/* ── Chapter 1: Today ────────────────────────────────────────────────────── */
const CLS = { sa: 's1', oa: 's2', ma: 's3' }; // same colours as the planner's balance chart

function AccountsBar({ scene }) {
  const total = Math.max(1, scene.total);
  return (
    <div className="st-accounts">
      <div className="st-bar" role="img"
        aria-label={scene.accounts.map((x) => `${x.name} ${money(x.amount)}`).join(', ')}>
        {scene.accounts.filter((x) => x.amount > 0).map((x) => (
          <span key={x.key} className={`seg ${CLS[x.key]}`} style={{ width: `${(x.amount / total) * 100}%` }} />
        ))}
      </div>
      <ul className="st-key">
        {scene.accounts.map((x) => (
          <li key={x.key}>
            <span className={`sw ${CLS[x.key]}`} aria-hidden="true" />
            <span className="st-key-name">{x.name}</span>
            <b className="fig">{money(x.amount)}</b>
            <em>{x.use}</em>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Meaning({ scene }) {
  const from = `from ${scene.payoutAge}`;
  if (scene.status === 'no-target') {
    return <p className="st-meaning">At this pace, CPF gives you about <b>{money(scene.income)} a month {from}</b>, in today's dollars.</p>;
  }
  return (
    <p className="st-meaning">
      At this pace, CPF gives you about <b>{money(scene.income)} a month {from}</b>, in today's dollars.{' '}
      {scene.status === 'gap'
        ? <>That is <b>{money(scene.gap)} short</b> of the {money(scene.target)} you want.</>
        : <>That is {money(scene.above)} more than the {money(scene.target)} you want.</>}
    </p>
  );
}

function TodayHow({ scene, plan }) {
  return (
    <ShowHow>
        <table className="st-table">
          <caption className="visually-hidden">Your CPF accounts today and what goes in this year</caption>
          <thead><tr><th scope="col">Account</th><th scope="col">Today</th><th scope="col">Going in this year</th></tr></thead>
          <tbody>
            {scene.accounts.map((x) => {
              const s = scene.split.find((y) => y.key === x.key);
              return <tr key={x.key}><th scope="row">{x.name} ({x.short})</th><td className="fig">{money(x.amount)}</td><td className="fig">{money(s?.yearly)}</td></tr>;
            })}
            <tr className="st-total"><th scope="row">Total</th><td className="fig">{money(scene.total)}</td><td className="fig">{money(scene.yearIn)}</td></tr>
          </tbody>
        </table>
        <ul className="st-notes">
          <li>Going in: mandatory contributions from you and your employer this year, using the CPF contribution and allocation rates for your age and residency from 1 Jan 2026, up to the wage ceilings.</li>
          <li>Monthly income {`from ${scene.payoutAge}`}: CPF LIFE {PLAN_NAMES[plan.answers.lifePlan] || 'Standard'} plan {money(scene.lifeIncome)}, plus your Ordinary Account spread to age {scene.spreadTo} {money(scene.oaIncome)}{scene.otherIncome > 0 ? `, plus home sale ${money(scene.otherIncome)}` : ''}.</li>
          <li>All future amounts are in today's dollars, with prices rising {Math.round(scene.inflation * 1000) / 10}% a year. Your pay is assumed to keep pace.</li>
          <li>CPF rules version {RULES_VERSION}. The year-by-year table is in the planner under Details.</li>
        </ul>
    </ShowHow>
  );
}

export default function TodayChapter({ plan, answers, onChange, sample, onPick }) {
  const scene = useMemo(() => todayScene(plan), [plan]);
  const set = (k) => (v) => onChange({ [k]: v });
  return (
    <Scene id="today">

      <section className="st-answer panel">
        <p className="st-big"><span className="fig">{money(scene.total)}</span> <span className="st-unit">in CPF today</span></p>
        <p className="st-sub">{scene.monthIn > 0 ? `${money(scene.monthIn)} goes in every month at age ${scene.age}.`
          : answers.work === 'none' ? `Nothing goes in from pay: your plan says you are not working (age ${scene.age}).`
            : `No contributions from pay this year (age ${scene.age}).`}</p>
        <AccountsBar scene={scene} />
        <Meaning scene={scene} />
        <GapPill status={scene.status} gap={scene.gap} above={scene.above} />
      </section>

      <section className="st-levers panel" aria-labelledby="st-levers-h">
        <h2 id="st-levers-h">Your figures</h2>
        <p className="muted small">{sample ? 'Change these to see the answer move. Sample figures are not saved.' : 'Changes are saved to your plan and show in the planner too.'}</p>
        <div className="st-lever-grid">
          {answers.work === 'employee'
            ? <MoneyField id="st-salary" label="Monthly pay before CPF" value={answers.salary} onChange={set('salary')} hint="Before your own CPF is taken off" />
            : answers.work === 'self'
              ? <MoneyField id="st-trade" label="Yearly net trade income" value={answers.tradeIncome} onChange={set('tradeIncome')} hint="Self-employed: decides your MediSave contributions" />
              : <p className="st-fact"><span className="field-label">Work</span>Not working<span className="field-hint">Change this in the planner under Details.</span></p>}
          <MoneyField id="st-target" label={`Monthly income you want from ${plan.payoutAge}`} value={answers.targetIncome} onChange={set('targetIncome')} hint="In today's dollars" />
        </div>
        <details className="st-balances">
          <summary>Update your CPF balances</summary>
          <p className="muted small">From your latest CPF statement or the CPF app.</p>
          <div className="st-lever-grid three">
            <MoneyField id="st-oa" label="Ordinary Account" value={answers.oa} onChange={set('oa')} />
            <MoneyField id="st-sa" label={scene.after55 ? 'Retirement Account' : 'Special Account'} value={answers.sa} onChange={set('sa')} />
            <MoneyField id="st-ma" label="MediSave Account" value={answers.ma} onChange={set('ma')} />
          </div>
        </details>
      </section>

      <TodayHow scene={scene} plan={plan} />
      <SceneNav id="today" onPick={onPick} />
    </Scene>
  );
}
