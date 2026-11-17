/**
 * Chapter 9, My plan: the moves saved in the chapters, what each one adds, and the result.
 * Each move's effect is worked out by re-running the plan without it (myPlanScene).
 */
import { useMemo } from 'react';
import { CHAPTERS, myPlanScene, todayScene, turning55Scene, legacyScene } from '../model/studio.js';
import { healthcare } from '../model/household.js';
import { LIFE_EVENTS, cleanLifeEvents } from '../model/plan.js';
import { RULES_VERSION } from '../policy/cpf2026.js';
import { VERSION_LABEL } from '../version.js';
import { money, pct } from '../next/ui.jsx';
import { Scene, GapPill, SceneNav, useDollars } from './shared.jsx';

const chapterTitle = (id) => CHAPTERS.find((c) => c.id === id)?.title || '';
const day = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' }); };

/** One page summary for screen and print: each chapter's key figure, then the assumptions. */
function Numbers({ plan, now }) {
  const t = todayScene(plan), f = turning55Scene(plan), g = legacyScene(plan), h = healthcare(plan);
  const rows = [
    ['Today', `${money(t.total)} in CPF; ${money(t.monthIn)} a month going in`],
    ['Turning 55', f.done ? `Retirement Account ${money(f.ra)}` : `${pct(Math.min(1, f.coverage))} of the Full Retirement Sum in ${f.year55} (${money(f.ra)} of ${money(f.sums.FRS)})`],
    ['Payout', `${money(plan.incomeToday)} a month from ${plan.payoutAge}: CPF LIFE ${money(plan.payoutToday)} for life, Ordinary Account ${money(plan.oaMonthlyToday)}${plan.otherMonthlyToday ? `, home sale ${money(plan.otherMonthlyToday)}` : ''}${plan.savingsMonthlyToday ? `, savings ${money(plan.savingsMonthlyToday)}` : ''}`],
    ['Target', plan.target > 0 ? (plan.gapToday > 0 ? `${money(plan.target)} a month: ${money(plan.gapToday)} short` : `${money(plan.target)} a month: met`) : 'No target set'],
    ['Later life', h.runsOut ? `MediSave runs out at ${h.runsOut}; about ${money(h.cashToday)} in cash needed to 90` : 'MediSave covers premiums and bills to 90'],
    ['Legacy', g.at85 ? `${money(g.at85.total)} left for family at 85${plan.answers.dieWithZero ? ` (spending down by ${plan.answers.dieWithZeroAge})` : ''}` : '—'],
  ];
  if (plan.savingsAtPayoutToday > 0) rows.splice(3, 0, ['Outside CPF', `${money(plan.savingsAtPayoutToday)} in savings at ${plan.payoutAge}${plan.savingsMonthlyToday ? `, paying ${money(plan.savingsMonthlyToday)} a month` : ', not counted as income'}`]);
  const events = cleanLifeEvents(plan.answers.lifeEvents, plan.age);
  if (events.length) rows.push(['Life events', events.map((e) => `${LIFE_EVENTS[e.type].label} at ${e.startAge}${e.endAge > e.startAge ? `–${e.endAge}` : ''}`).join('; ')]);
  return (
    <section className="panel st-numbers" aria-labelledby="st-num-h">
      <h2 id="st-num-h">Your plan in numbers</h2>
      <p className="small muted print-only">Fusion 富生 Studio report · {now.toLocaleDateString('en-SG', { day: 'numeric', month: 'long', year: 'numeric' })} · {VERSION_LABEL}</p>
      <table className="st-table">
        <caption className="visually-hidden">Key figures from each chapter</caption>
        <tbody>{rows.map(([k, v]) => <tr key={k}><th scope="row">{k}</th><td className="st-num-text">{v}</td></tr>)}</tbody>
      </table>
      <p className="small muted">Amounts in today's dollars except where a year is named. Prices rise {Math.round(plan.assumptions.inflation * 1000) / 10}% a year; retirement sums {Math.round(plan.assumptions.sumGrowth * 1000) / 10}% a year after 2027; CPF interest at today's floor rates. CPF rules version {RULES_VERSION}.</p>
    </section>
  );
}

export default function MyPlanChapter({ plan, moves, now, onUndo, onRemove, onPick, sample }) {
  const s = useMemo(() => myPlanScene(plan, moves, now), [plan, moves, now]);
  const $ = useDollars();
  return (
    <Scene id="plan">
      <section className="st-answer panel">
        <p className="st-big"><span className="fig">{$.amount(s.income, s.payoutAge)}</span> <span className="st-unit">a month from {s.payoutAge}, {$.label(s.payoutAge)}</span></p>
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

      <Numbers plan={plan} now={now} />

      <div className="st-row no-print">
        <button type="button" className="btn btn-primary" onClick={() => window.print()}>Print or save as PDF</button>
      </div>
      <p className="small muted">Figures are estimates from CPF rules as at the rules version shown in the planner. They are not financial advice.</p>
      <SceneNav id="plan" onPick={onPick} />
    </Scene>
  );
}
