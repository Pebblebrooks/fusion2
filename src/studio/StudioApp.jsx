/**
 * Fusion Studio (/app/studio/): the whole-life planner for Workspace and Adviser, told chapter by chapter.
 * It reads and writes the same saved plan as the new planner (src/next/storage.js), so details are
 * entered once. Studio writes its own part of the plan (chapter, saved moves) with from: 'studio'.
 * Figures come from src/model/studio.js, which takes them from the CPF engine via buildPlan.
 */
import { useEffect, useMemo, useState } from 'react';
import { DEFAULT_ANSWERS, buildPlan } from '../model/plan.js';
import { CHAPTERS, chapterWhen, todayScene, cleanStudio } from '../model/studio.js';
import { RULES_VERSION } from '../policy/cpf2026.js';
import { loadPlan, savePlan, currentTier, getTheme, setTheme, PLAN_KEY } from '../next/storage.js';
import { MoneyField, money } from '../next/ui.jsx';
import { VERSION_LABEL } from '../version.js';

const PLAN_NAMES = { std: 'Standard', esc: 'Escalating', bas: 'Basic' };

/* ── Shell ───────────────────────────────────────────────────────────────── */
function Header({ theme, onTheme }) {
  return (
    <header className="app-header">
      <div className="wrap">
        <a className="brand" href="/" aria-label="Fusion 富生 home"><span className="brand-mark" aria-hidden="true">富</span><span className="brand-name">Fusion</span></a>
        <span className="st-name">Studio</span>
        <span className="brand-beta">PREVIEW</span>
        <div className="header-actions st-actions">
          <a className="btn btn-ghost st-back" href="/app/">Back to planner</a>
          <button type="button" className="icon-btn" onClick={onTheme} aria-label={theme === 'dark' ? 'Use light theme' : 'Use dark theme'}>
            {theme === 'dark'
              ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
              : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" /></svg>}
          </button>
        </div>
      </div>
    </header>
  );
}

/** The life timeline: every chapter in order, the current one marked. Unbuilt chapters show as coming. */
function Journey({ plan, current, onPick }) {
  return (
    <nav className="st-journey" aria-label="Chapters of your plan">
      <ol className="wrap">
        {CHAPTERS.map((c, i) => {
          const on = c.id === current;
          const when = plan ? chapterWhen(c.id, plan) : '';
          return (
            <li key={c.id} className={`${on ? 'on' : ''} ${c.ready ? '' : 'soon'}`}>
              <button type="button" disabled={!c.ready} aria-current={on ? 'step' : undefined} onClick={() => onPick(c.id)}
                title={c.ready ? c.question : `${c.title}: coming in a later preview`}>
                <span className="st-dot" aria-hidden="true">{i + 1}</span>
                <span className="st-ch">{c.title}</span>
                <span className="st-when">{c.ready ? when : 'Soon'}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** Who can open Studio: Workspace and Adviser. Everyone else gets a way back. */
function Locked({ tier }) {
  return (
    <section className="panel st-locked">
      <h1>Fusion Studio is part of Workspace and Adviser</h1>
      <p className="muted">
        {tier ? 'Your plan is Guided. Studio tells your whole CPF life story, chapter by chapter, with family, property and what-if tools.'
          : 'Sign in, or enter your access code, in the planner first. Studio then opens with the same plan.'}
      </p>
      <div className="st-row">
        <a className="btn btn-primary" href="/app/">{tier ? 'Back to planner' : 'Open the planner'}</a>
        {tier && <a className="btn btn-ghost" href="/pricing/">See plans</a>}
      </div>
    </section>
  );
}

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

function GapPill({ scene }) {
  if (scene.status === 'no-target') return null;
  return scene.status === 'gap'
    ? <p className="st-pill gap"><span>Income gap</span><b className="fig">{money(scene.gap)}</b><span>a month</span></p>
    : <p className="st-pill ok"><span>No income gap</span><b className="fig">{money(scene.above)}</b><span>a month to spare</span></p>;
}

function ShowHow({ scene, plan }) {
  return (
    <details className="st-how">
      <summary>Show how this is worked out</summary>
      <div className="st-how-body">
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
      </div>
    </details>
  );
}

function TodayChapter({ plan, answers, onChange, sample }) {
  const scene = useMemo(() => todayScene(plan), [plan]);
  const set = (k) => (v) => onChange({ [k]: v });
  return (
    <article className="st-scene" aria-labelledby="st-q">
      <p className="eyebrow">Chapter 1 · Today</p>
      <h1 id="st-q">Where do I stand today?</h1>

      <section className="st-answer panel">
        <p className="st-big"><span className="fig">{money(scene.total)}</span> <span className="st-unit">in CPF today</span></p>
        <p className="st-sub">{money(scene.monthIn)} goes in every month at age {scene.age}.</p>
        <AccountsBar scene={scene} />
        <Meaning scene={scene} />
        <GapPill scene={scene} />
      </section>

      <section className="st-levers panel" aria-labelledby="st-levers-h">
        <h2 id="st-levers-h">Your figures</h2>
        <p className="muted small">{sample ? 'Change these to see the answer move. Sample figures are not saved.' : 'Changes are saved to your plan and show in the planner too.'}</p>
        <div className="st-lever-grid">
          <MoneyField id="st-salary" label="Monthly pay before CPF" value={answers.salary} onChange={set('salary')} hint={answers.work === 'employee' ? 'Before your own CPF is taken off' : 'Used only if you are an employee'} />
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

      <ShowHow scene={scene} plan={plan} />

      <footer className="st-next">
        <button type="button" className="btn btn-primary" disabled>Next: Building · coming in the next preview</button>
        <a className="link" href="/app/">Open the planner</a>
      </footer>
    </article>
  );
}

/* ── App ─────────────────────────────────────────────────────────────────── */
export default function StudioApp() {
  const [tier] = useState(currentTier);
  const [theme, setThemeState] = useState(getTheme);
  const [saved, setSaved] = useState(() => loadPlan());
  // No finished plan yet: a sample person, changed in memory only.
  const sample = !saved?.done;
  const [state, setState] = useState(() => (sample ? { answers: { ...DEFAULT_ANSWERS }, done: false, tried: {}, scenarios: [], studio: cleanStudio(null) } : saved));
  const chapter = state.studio?.chapter || 'today';
  const now = useMemo(() => new Date(), []);
  const plan = useMemo(() => buildPlan(state.answers, now), [state.answers, now]);

  // The planner open in another tab saved the plan: pick it up here.
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key !== PLAN_KEY) return;
      const next = loadPlan();
      setSaved(next);
      if (next?.done) setState(next);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Saved straight away (not in an effect), so a plan picked up from another tab is never written back.
  const commit = (next) => { setState(next); if (!sample) savePlan(next, { from: 'studio' }); };
  const update = (patch) => commit({ ...state, answers: { ...state.answers, ...patch } });
  const pick = (id) => commit({ ...state, studio: { ...cleanStudio(state.studio), chapter: id } });
  const flip = () => { const m = theme === 'dark' ? 'light' : 'dark'; setTheme(m); setThemeState(m); };

  const allowed = tier === 'plus' || tier === 'pro';
  return (
    <div className="app studio">
      <a className="skip-link" href="#st-main">Skip to content</a>
      <Header theme={theme} onTheme={flip} />
      {allowed && <Journey plan={plan} current={chapter} onPick={pick} />}
      <main id="st-main" className="wrap st-main">
        {!allowed && <Locked tier={tier} />}
        {allowed && sample && (
          <p className="st-sample" role="note">
            You are looking at a sample person, born {DEFAULT_ANSWERS.birthYear}, earning {money(DEFAULT_ANSWERS.salary)} a month.{' '}
            <a href="/app/">Set up your own plan in the planner</a> and Studio picks it up.
          </p>
        )}
        {allowed && chapter === 'today' && <TodayChapter plan={plan} answers={state.answers} onChange={update} sample={sample} />}
      </main>
      <footer className="wrap st-foot small muted">Fusion 富生 Studio {VERSION_LABEL}</footer>
    </div>
  );
}
