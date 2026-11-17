/**
 * The What if panel: opened from any chapter. Lists the best few moves for this plan (each measured
 * by re-running the plan with that one change) and two answers worked back from the target.
 * "Try it" opens the chapter that owns the setting, with the change ready to save or undo.
 */
import { useEffect, useMemo, useRef } from 'react';
import { whatIf, CHAPTERS } from '../model/studio.js';
import { money } from '../next/ui.jsx';

const title = (id) => CHAPTERS.find((c) => c.id === id)?.title || '';

export default function WhatIfPanel({ answers, now, onTry, onClose }) {
  const w = useMemo(() => whatIf(answers, now), [answers, now]);
  const ref = useRef(null);
  useEffect(() => {
    const prev = document.activeElement;
    ref.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); prev?.focus?.(); };
  }, [onClose]);
  return (
    <div className="st-scrim" onClick={onClose}>
      <aside className="st-drawer" role="dialog" aria-modal="true" aria-labelledby="st-wi-h" tabIndex={-1} ref={ref} onClick={(e) => e.stopPropagation()}>
        <header className="st-drawer-head">
          <h2 id="st-wi-h">What if…</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </header>
        <p className="muted small">Your plan today: {money(w.income)} a month{w.target > 0 ? `, ${w.gap > 0 ? `${money(w.gap)} short of` : 'meeting'} your ${money(w.target)} target` : ''}.</p>

        <h3>Your best moves</h3>
        {w.best.length === 0 && <p className="muted">No single change adds much to this plan.</p>}
        <ol className="st-wi-list">
          {w.best.map((m) => (
            <li key={m.key}>
              <p className="st-move-name">{m.title} <b className="gain fig">+{money(m.gain)} a month</b></p>
              <p className="small muted">{[m.cost, m.bonus].filter(Boolean).join('. ')}.</p>
              {m.catch && <p className="small">Catch: {m.catch}</p>}
              <button type="button" className="btn btn-secondary" onClick={() => onTry(m.chapter, m.change)}>Try it in {title(m.chapter)}</button>
            </li>
          ))}
        </ol>

        {w.target > 0 && (
          <>
            <h3>Working back from your target</h3>
            <ul className="st-wi-list">
              <li>
                {w.topUp?.amount
                  ? <><p className="st-move-name">Top up {money(w.topUp.amount)} a year in cash</p><p className="small muted">Meets your target{w.topUp.taxSaved ? `; saves about ${money(w.topUp.taxSaved)} a year in income tax` : ''}.</p>
                    <button type="button" className="btn btn-secondary" onClick={() => onTry(w.topUp.chapter, w.topUp.change)}>Try it in {title(w.topUp.chapter)}</button></>
                  : <p className="muted">Top-ups alone cannot reach your target: they are capped at the retirement sums.</p>}
              </li>
              {w.startAge && (
                <li><p className="st-move-name">Start CPF LIFE at {w.startAge.age}</p><p className="small muted">The earliest start age that meets your target. Each year you wait raises your payouts.</p>
                  <button type="button" className="btn btn-secondary" onClick={() => onTry(w.startAge.chapter, w.startAge.change)}>Try it in {title(w.startAge.chapter)}</button></li>
              )}
              <li>
                {w.stopWork?.age
                  ? <><p className="st-move-name">You could stop work at {w.stopWork.age}</p><p className="small muted">The earliest age that still meets your target.</p>
                    <button type="button" className="btn btn-secondary" onClick={() => onTry(w.stopWork.chapter, w.stopWork.change)}>Try it in {title(w.stopWork.chapter)}</button></>
                  : <p className="muted">Working longer alone does not reach your target{w.stopWork?.best ? `: the most is about ${money(w.stopWork.best)} a month` : ''}.</p>}
              </li>
            </ul>
          </>
        )}
        {w.frsTopUp && (
          <>
            <h3>Reaching the Full Retirement Sum at 55</h3>
            <ul className="st-wi-list"><li><p className="st-move-name">Top up {money(w.frsTopUp.amount)} a year in cash</p><p className="small muted">Fills your Retirement Account to the Full Retirement Sum when it is formed at 55.</p>
              <button type="button" className="btn btn-secondary" onClick={() => onTry(w.frsTopUp.chapter, w.frsTopUp.change)}>Try it in {title(w.frsTopUp.chapter)}</button></li></ul>
          </>
        )}
        <p className="small muted">To compare whole plans side by side, use Compare in the planner.</p>
      </aside>
    </div>
  );
}
