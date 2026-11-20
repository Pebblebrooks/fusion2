/**
 * About Fusion Studio: opened from the header on every screen, including before sign-in.
 * Same panel pattern as What if (focus moves in, Escape closes, focus returns).
 */
import { useEffect, useRef } from 'react';
import { RULES_VERSION } from '../policy/cpf2026.js';
import { VERSION_LABEL } from '../version.js';

const SOURCES = [
  ['CPF Board', 'https://www.cpf.gov.sg'],
  ['HDB', 'https://www.hdb.gov.sg'],
  ['IRAS', 'https://www.iras.gov.sg'],
  ['Ministry of Health', 'https://www.moh.gov.sg'],
];

const rulesDate = new Date(`${RULES_VERSION}T00:00:00+08:00`).toLocaleDateString('en-SG', { day: 'numeric', month: 'long', year: 'numeric' });

export default function AboutPanel({ onClose }) {
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
      <aside className="st-drawer st-about" role="dialog" aria-modal="true" aria-labelledby="st-about-h" tabIndex={-1} ref={ref} onClick={(e) => e.stopPropagation()}>
        <header className="st-drawer-head">
          <h2 id="st-about-h">About Fusion Studio</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </header>

        <p>Fusion Studio tells your CPF story one chapter at a time, from today through turning 55, payouts, later life and what you leave behind. Each chapter answers one question and shows how the numbers were worked out.</p>

        <h3>How it works</h3>
        <ul className="st-about-list">
          <li><b>Facts</b> about you, such as your balances, home and family, are saved as soon as you change them.</li>
          <li><b>Choices</b>, such as top-ups or when to start payouts, are tried first. Save one as a move and it is added to My plan, where you can undo it.</li>
          <li><b>What if</b> lists the changes that would help your plan most.</li>
          <li><b>Today's $ / Future $</b> switches the headline figures between today's prices and the prices of the year they apply.</li>
        </ul>

        <h3>Your data</h3>
        <p>Your plan is kept in this browser on this device and is shared with the Fusion planner. Clearing your browser data removes it.</p>

        <h3>The rules behind the numbers</h3>
        <p>Calculations follow CPF rules as published by the government bodies below, checked on {rulesDate}. Future amounts are estimates built on assumptions you can see in each chapter's "Show how".</p>
        <ul className="st-about-list">
          {SOURCES.map(([name, url]) => <li key={name}><a href={url} target="_blank" rel="noopener noreferrer">{name}</a></li>)}
        </ul>

        <h3>Not financial advice</h3>
        <p>Fusion Studio is a planning tool. It is not financial advice, and CPF Board sets your actual payouts. Check important decisions with CPF Board or a licensed adviser.</p>

        <p className="small muted st-about-ver">{VERSION_LABEL} · CPF rules {RULES_VERSION}</p>
      </aside>
    </div>
  );
}
