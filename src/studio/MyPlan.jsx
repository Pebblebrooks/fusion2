/**
 * Chapter 9, My plan: the moves saved in the chapters, what each one adds, and the result.
 * Each move's effect is worked out by re-running the plan without it (myPlanScene).
 */
import { useMemo } from 'react';
import { CHAPTERS, myPlanScene } from '../model/studio.js';
import { money, pct } from '../next/ui.jsx';
import { Scene, GapPill, SceneNav } from './shared.jsx';

const chapterTitle = (id) => CHAPTERS.find((c) => c.id === id)?.title || '';
const day = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' }); };

export default function MyPlanChapter({ plan, moves, now, onUndo, onRemove, onPick, sample }) {
  const s = useMemo(() => myPlanScene(plan, moves, now), [plan, moves, now]);
  return (
    <Scene id="plan">
      <section className="st-answer panel">
        <p className="st-big"><span className="fig">{money(s.income)}</span> <span className="st-unit">a month from {s.payoutAge}, in today's dollars</span></p>
        <p className="st-sub">CPF LIFE {money(s.life)} for life, plus Ordinary Account {money(s.oa)}{s.age < 55 ? `. At 55: ${pct(Math.min(1, s.frsCoverage))} of the Full Retirement Sum` : ''}.</p>
        <GapPill status={s.status} gap={s.gap} above={s.above} />
      </section>

      <section className="panel st-moves" aria-labelledby="st-moves-h">
        <h2 id="st-moves-h">Your moves</h2>
        {s.moves.length === 0 ? (
          <p className="muted">No moves saved yet. In <b>Building</b>, <b>Turning 55</b> and <b>Payout</b>, try a change and choose <b>Save this move</b>; it appears here with what it adds.</p>
        ) : (
          <ol className="st-move-list">
            {s.moves.map((m) => (
              <li key={m.id} className={m.active ? '' : 'off'}>
                <div>
                  <p className="st-move-name">{m.label}</p>
                  <p className="small muted">{chapterTitle(m.chapter)}{day(m.at) ? ` · saved ${day(m.at)}` : ''}{m.active ? '' : ' · changed since, no longer in your plan'}</p>
                </div>
                {m.active && (m.gain !== 0
                  ? <p className={`fig st-move-gain ${m.gain > 0 ? 'gain' : 'danger'}`}>{m.gain > 0 ? '+' : '−'}{money(Math.abs(m.gain))}<span className="small muted"> a month</span></p>
                  : <p className="small muted">{m.chapter === 'family' ? 'Lowers your tax' : 'No change to your income'}</p>)}
                <div className="st-row tight no-print">
                  {m.active
                    ? <button type="button" className="btn btn-ghost" onClick={() => onUndo(m)}>Undo</button>
                    : <button type="button" className="btn btn-ghost" onClick={() => onRemove(m)}>Remove</button>}
                </div>
              </li>
            ))}
          </ol>
        )}
        {s.moves.length > 1 && <p className="small muted">Each amount is what that move adds with the others in place. Moves can work together, so the amounts may not add up exactly.</p>}
        {sample && <p className="small muted">Sample figures: moves are kept until you leave this page.</p>}
      </section>

      <div className="st-row no-print">
        <button type="button" className="btn btn-secondary" onClick={() => window.print()}>Print my plan</button>
      </div>
      <p className="small muted">Figures are estimates in today's dollars from CPF rules as at the rules version shown in the planner. They are not financial advice.</p>
      <SceneNav id="plan" onPick={onPick} />
    </Scene>
  );
}
