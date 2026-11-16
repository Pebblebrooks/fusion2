/**
 * Pieces every Studio scene uses: the scene frame (question, answer, levers, show how, next),
 * the income-gap pill, the "save this move" bar and the chapter footer.
 */
import { CHAPTERS, nextChapter, prevChapter } from '../model/studio.js';
import { money } from '../next/ui.jsx';

/** Scene frame: eyebrow, the chapter's question, then the scene's own parts in order. */
export function Scene({ id, children }) {
  const i = CHAPTERS.findIndex((c) => c.id === id), c = CHAPTERS.at(i);
  return (
    <article className="st-scene" aria-labelledby="st-q">
      <p className="eyebrow">Chapter {i + 1} · {c.title}</p>
      <h1 id="st-q">{c.question}</h1>
      {children}
    </article>
  );
}

/** One income gap, in dollars a month, or the amount to spare. */
export function GapPill({ status, gap, above }) {
  if (status === 'no-target') return null;
  return status === 'gap'
    ? <p className="st-pill gap"><span>Income gap</span><b className="fig">{money(gap)}</b><span>a month</span></p>
    : <p className="st-pill ok"><span>No income gap</span><b className="fig">{money(above)}</b><span>a month to spare</span></p>;
}

/**
 * Shown while levers differ from the saved plan: what the change does to monthly income,
 * and the choice to keep it (saved as a move on My plan) or drop it.
 */
export function TrialBar({ label, base, plan, onSave, onReset }) {
  if (!label) return null;
  const d = plan.incomeToday - base.incomeToday;
  return (
    <div className="st-trial" role="status">
      <p>
        <b>Trying:</b> {label}.{' '}
        Monthly income from {plan.payoutAge} {d === 0 ? 'stays at' : d > 0 ? 'goes up' : 'goes down'}{d !== 0 && <> by <b className={d > 0 ? 'gain' : 'danger'}>{money(Math.abs(d))}</b> to</>} {money(plan.incomeToday)}.
      </p>
      <div className="st-row tight">
        <button type="button" className="btn btn-primary" onClick={onSave}>Save this move</button>
        <button type="button" className="btn btn-ghost" onClick={onReset}>Undo</button>
      </div>
    </div>
  );
}

/** Collapsed working: tables and rule notes. */
export function ShowHow({ children }) {
  return (
    <details className="st-how">
      <summary>Show how this is worked out</summary>
      <div className="st-how-body">{children}</div>
    </details>
  );
}

/** Previous and next built chapters. */
export function SceneNav({ id, onPick }) {
  const prev = prevChapter(id), next = nextChapter(id);
  return (
    <footer className="st-next">
      {next && <button type="button" className="btn btn-primary" onClick={() => onPick(next.id)}>Next: {next.title}</button>}
      {prev && <button type="button" className="btn btn-ghost" onClick={() => onPick(prev.id)}>Back: {prev.title}</button>}
      <a className="link" href="/app/">Open the planner</a>
    </footer>
  );
}
