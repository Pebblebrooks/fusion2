/**
 * Fusion Studio (/app/studio/): the whole-life planner for Workspace and Adviser, told chapter by chapter.
 * It reads and writes the same saved plan as the new planner (src/next/storage.js), so details are
 * entered once. Studio writes its own part of the plan (chapter, saved moves) with from: 'studio'.
 * Figures come from src/model/studio.js, which takes them from the CPF engine via buildPlan.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { DEFAULT_ANSWERS, buildPlan } from '../model/plan.js';
import { CHAPTERS, chapterWhen, cleanStudio, makeMove, undoMove } from '../model/studio.js';
import { loadPlan, savePlan, currentTier, getTheme, setTheme, PLAN_KEY } from '../next/storage.js';
import { money } from '../next/ui.jsx';
import { VERSION_LABEL } from '../version.js';
import TodayChapter from './Today.jsx';
import { BuildingChapter, Turning55Chapter, PayoutChapter } from './Chapters.jsx';
import MyPlanChapter from './MyPlan.jsx';
import { HomeChapter, LaterChapter, LegacyChapter } from './LaterChapters.jsx';
import WhatIfPanel from './WhatIf.jsx';
import { DollarsContext } from './shared.jsx';
import FamilyChapter from './Family.jsx';

const MAX_MOVES = 20;

/* ── Shell ───────────────────────────────────────────────────────────────── */
function Header({ theme, onTheme, onWhatIf, future, onFuture }) {
  return (
    <header className="app-header">
      <div className="wrap">
        <a className="brand" href="/" aria-label="Fusion 富生 home"><span className="brand-mark" aria-hidden="true">富</span><span className="brand-name">Fusion</span></a>
        <span className="st-name">Studio</span>
        <span className="brand-beta">PREVIEW</span>
        <div className="header-actions st-actions">
          {onFuture && (
            <div className="st-dollars" role="group" aria-label="Show amounts in">
              <button type="button" aria-pressed={!future} onClick={() => onFuture(false)}>Today's $</button>
              <button type="button" aria-pressed={future} onClick={() => onFuture(true)}>Future $</button>
            </div>
          )}
          {onWhatIf && <button type="button" className="btn btn-secondary" onClick={onWhatIf}>What if…</button>}
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

/* ── App ─────────────────────────────────────────────────────────────────── */
export default function StudioApp() {
  const [tier] = useState(currentTier);
  const [theme, setThemeState] = useState(getTheme);
  const [saved, setSaved] = useState(() => loadPlan());
  // No finished plan yet: a sample person, changed in memory only.
  const sample = !saved?.done;
  const [state, setState] = useState(() => (sample ? { answers: { ...DEFAULT_ANSWERS }, done: false, tried: {}, scenarios: [], studio: cleanStudio(null) } : saved));
  const studio = cleanStudio(state.studio);
  const chapter = CHAPTERS.find((c) => c.id === studio.chapter && c.ready) ? studio.chapter : 'today';
  // Changes being tried in this chapter: shown at once, kept only when saved as a move.
  const [trial, setTrial] = useState({});
  const now = useMemo(() => new Date(), []);
  const base = useMemo(() => buildPlan(state.answers, now), [state.answers, now]);
  const trying = Object.keys(trial).filter((k) => trial[k] !== state.answers[k]);
  const plan = useMemo(() => (trying.length ? buildPlan({ ...state.answers, ...trial }, now) : base), [base, trial, trying.length, state.answers, now]);
  const move = useMemo(() => makeMove(chapter, trial, state.answers), [chapter, trial, state.answers]);

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
  const pick = (id) => {
    setTrial({});
    commit({ ...state, studio: { ...studio, chapter: id } });
    window.scrollTo(0, 0);
  };
  const lever = (k, v) => setTrial((t) => ({ ...t, [k]: v }));
  const val = (k) => (trial[k] !== undefined ? trial[k] : state.answers[k]);
  // Keep the move: it becomes part of the plan, and any planner what-if on the same setting is dropped.
  const saveMove = () => {
    if (!move) return;
    const tried = { ...(state.tried || {}) };
    for (const k of Object.keys(move.change)) delete tried[k];
    commit({ ...state, answers: { ...state.answers, ...move.change }, tried, studio: { ...studio, moves: [...studio.moves, move].slice(-MAX_MOVES) } });
    setTrial({});
  };
  const undo = (m) => commit({ ...state, answers: undoMove(state.answers, m), studio: { ...studio, moves: studio.moves.filter((x) => x.id !== m.id) } });
  const remove = (m) => commit({ ...state, studio: { ...studio, moves: studio.moves.filter((x) => x.id !== m.id) } });
  const flip = () => { const m = theme === 'dark' ? 'light' : 'dark'; setTheme(m); setThemeState(m); };
  // What if panel: a suggestion opens its chapter with the change ready to save or undo.
  const [whatIfOpen, setWhatIfOpen] = useState(false);
  const [future, setFuture] = useState(() => { try { return localStorage.getItem('fusion_studio_dollars') === 'future'; } catch { return false; } });
  const pickDollars = (f) => { setFuture(f); try { localStorage.setItem('fusion_studio_dollars', f ? 'future' : 'today'); } catch { /* not kept */ } };
  const dollars = useMemo(() => ({ future, inflation: plan.assumptions.inflation, age: plan.age, birthYear: plan.answers.birthYear }), [future, plan]);
  const closeWhatIf = useCallback(() => setWhatIfOpen(false), []);
  const tryIt = (id, change) => { pick(id); setTrial(change); setWhatIfOpen(false); };

  const allowed = tier === 'plus' || tier === 'pro';
  const props = { base, plan, val, lever, now, onPick: pick, trial: { label: move?.label, onSave: saveMove, onReset: () => setTrial({}) } };
  return (
    <div className="app studio">
      <a className="skip-link" href="#st-main">Skip to content</a>
      <Header theme={theme} onTheme={flip} onWhatIf={allowed ? () => setWhatIfOpen(true) : null} future={future} onFuture={allowed ? pickDollars : null} />
      {allowed && <Journey plan={base} current={chapter} onPick={pick} />}
      <DollarsContext.Provider value={dollars}>
      <main id="st-main" className="wrap st-main">
        {!allowed && <Locked tier={tier} />}
        {allowed && sample && (
          <p className="st-sample" role="note">
            You are looking at a sample person, born {DEFAULT_ANSWERS.birthYear}, earning {money(DEFAULT_ANSWERS.salary)} a month.{' '}
            <a href="/app/">Set up your own plan in the planner</a> and Studio picks it up.
          </p>
        )}
        {allowed && chapter === 'today' && <TodayChapter plan={base} answers={state.answers} onChange={update} sample={sample} onPick={pick} />}
        {allowed && chapter === 'building' && <BuildingChapter {...props} onFact={update} />}
        {allowed && chapter === 'turning55' && <Turning55Chapter {...props} onFact={update} />}
        {allowed && chapter === 'family' && <FamilyChapter {...props} onFact={update} />}
        {allowed && chapter === 'home' && <HomeChapter {...props} onFact={update} />}
        {allowed && chapter === 'payout' && <PayoutChapter {...props} />}
        {allowed && chapter === 'later' && <LaterChapter {...props} onFact={update} />}
        {allowed && chapter === 'legacy' && <LegacyChapter {...props} />}
        {allowed && chapter === 'plan' && <MyPlanChapter plan={base} moves={studio.moves} now={now} onUndo={undo} onRemove={remove} onPick={pick} sample={sample} />}
      </main>
      </DollarsContext.Provider>
      {allowed && whatIfOpen && <WhatIfPanel answers={state.answers} now={now} onTry={tryIt} onClose={closeWhatIf} />}
      <footer className="wrap st-foot small muted">Fusion 富生 Studio {VERSION_LABEL}</footer>
    </div>
  );
}
