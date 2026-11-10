/**
 * Workspace and Adviser features of the new planner.
 *   Workspace ('plus'): compare scenarios, stress test, year-by-year table + CSV, own assumptions, printable report.
 *   Adviser ('pro'):    everything in Workspace, plus client files on this device and a client report with firm name and notes.
 * Guided users see one short explanation of what the plan adds, never a wall of locks.
 */
import { useMemo, useState } from 'react';
import { buildPlan, summarise, stressTests, yearRows, toCsv } from '../model/plan.js';
import { PLAN_RANK, tierName } from '../entitlements/tiers.js';
import { tierForUpgradeCode } from '../entitlements/gate.js';
import { download, cleanState } from './storage.js';
import { money, pct, Slider } from './ui.jsx';

const has = (tier, need) => (PLAN_RANK[tier] ?? 0) >= PLAN_RANK[need];
const signed = (v) => (Math.round(v) === 0 ? 'no change' : `${v > 0 ? '+' : '−'}${money(Math.abs(v))}`);
const MAX_SCENARIOS = 4;

function Locked({ need, title, points }) {
  return (
    <section className="panel locked">
      <p className="eyebrow">{tierName(need)} plan</p>
      <h2>{title}</h2>
      <ul>{points.map((p) => <li key={p}>{p}</li>)}</ul>
      <div className="btn-row"><a className="btn btn-primary" href="/pricing/" target="_blank" rel="noopener">See plans and prices ↗</a></div>
      <p className="small muted">Already have a code? Enter it under Profile.</p>
    </section>
  );
}

/* ── Compare ──────────────────────────────────────────────────────────────── */
const describe = (tried, answers) => {
  const bits = [];
  if (tried.topUpYearly !== undefined) bits.push(`top up ${money(tried.topUpYearly)} a year`);
  if (tried.oaToSaYearly !== undefined) bits.push(`move ${money(tried.oaToSaYearly)} a year from OA`);
  if (tried.payoutAge !== undefined) bits.push(`payouts from ${tried.payoutAge}`);
  if (tried.stopWorkAge !== undefined) bits.push(`work until ${tried.stopWorkAge}`);
  if (tried.housingMonthly !== undefined) bits.push(`home loan from CPF ${money(tried.housingMonthly)} a month (now ${money(answers.housingMonthly)})`);
  return bits.join(', ') || 'no changes';
};

export function CompareView({ tier, base, plan, answers, tried, changed, scenarios, setScenarios, setTried, now, go }) {
  const [name, setName] = useState('');
  const cols = useMemo(() => [
    { id: 'base', name: 'Starting plan', note: 'your answers as entered', s: summarise(base) },
    ...scenarios.map((sc, i) => ({ id: `s${i}`, i, name: sc.name, note: describe(sc.tried, answers), tried: sc.tried, s: summarise(buildPlan({ ...answers, ...sc.tried }, now)) })),
  ], [base, scenarios, answers, now]);
  if (!has(tier, 'plus')) {
    return <Locked need="plus" title="Compare your options side by side" points={[
      'Save up to four what-if scenarios and see them in one table',
      'Stress-test your plan against higher prices, flat pay and stopping work early',
      'Year-by-year balances you can download, and a report you can print',
    ]} />;
  }
  const save = (e) => {
    e.preventDefault();
    setScenarios((list) => [...list, { name: name.trim() || `Scenario ${list.length + 1}`, tried }].slice(0, MAX_SCENARIOS));
    setName('');
  };
  const rows = [
    ['Monthly income', (s) => money(s.incomeToday), (s) => s.incomeToday],
    ['CPF LIFE, for life', (s) => money(s.payoutToday), (s) => s.payoutToday],
    ['Ordinary Account, to 90', (s) => money(s.oaMonthlyToday), (s) => s.oaMonthlyToday],
    ['Gap to your target', (s) => (s.gapToday > 0 ? money(s.gapToday) : 'None'), null],
    ['Payouts start at', (s) => `${s.payoutAge}`, null],
    ['Full Retirement Sum at 55', (s) => pct(s.frsCoverage), null],
    ['Readiness', (s) => `${s.score} · ${s.label}`, null],
  ];
  const best = Math.max(...cols.map((c) => c.s.incomeToday));
  return (
    <>
      <section className="lead compact">
        <p className="eyebrow">Compare</p>
        <h1>Your options, side by side.</h1>
        <p className="muted">Set up a what-if under Moves, then save it here. Monthly figures are in today&rsquo;s dollars.</p>
      </section>

      <section className="panel">
        <h2>Save what you are trying now</h2>
        {changed === 0 ? (
          <p className="muted">You have no what-if changes at the moment. <button type="button" className="link" onClick={() => go('moves')}>Try some moves</button> and come back.</p>
        ) : scenarios.length >= MAX_SCENARIOS ? (
          <p className="muted">You have {MAX_SCENARIOS} saved scenarios. Remove one to save another.</p>
        ) : (
          <form className="save-row" onSubmit={save}>
            <label className="fld" htmlFor="sc-name"><span className="field-label">Name</span>
              <input id="sc-name" value={name} maxLength={30} placeholder={`Scenario ${scenarios.length + 1}`} onChange={(e) => setName(e.target.value)} /></label>
            <button type="submit" className="btn btn-primary">Save scenario</button>
            <p className="field-hint">Now trying: {describe(tried, answers)}. Income {money(plan.incomeToday)} a month.</p>
          </form>
        )}
      </section>

      <section className="panel">
        <h2>Comparison</h2>
        <div className="table-scroll">
          <table className="data compare">
            <thead><tr><th scope="col"><span className="visually-hidden">Measure</span></th>{cols.map((c) => (
              <th key={c.id} scope="col" className={c.s.incomeToday === best && cols.length > 1 ? 'best' : ''}>{c.name}{c.s.incomeToday === best && cols.length > 1 && <span className="tag">Highest income</span>}</th>
            ))}</tr></thead>
            <tbody>
              {rows.map(([label, show, val]) => (
                <tr key={label}><th scope="row">{label}</th>{cols.map((c) => (
                  <td key={c.id}>{show(c.s)}{val && c.id !== 'base' && <small className={val(c.s) - val(cols[0].s) > 0 ? 'gain' : 'muted'}>{signed(val(c.s) - val(cols[0].s))}</small>}</td>
                ))}</tr>
              ))}
              <tr><th scope="row">What changes</th>{cols.map((c) => <td key={c.id} className="wrap-cell">{c.note}</td>)}</tr>
              {scenarios.length > 0 && <tr><th scope="row"><span className="visually-hidden">Actions</span></th>{cols.map((c) => (
                <td key={c.id}>{c.id !== 'base' && <span className="cell-actions">
                  <button type="button" className="link" onClick={() => { setTried(c.tried); go('plan'); }}>Use</button>
                  <button type="button" className="link danger" onClick={() => setScenarios((l) => l.filter((_, i) => i !== c.i))}>Remove</button>
                </span>}</td>
              ))}</tr>}
            </tbody>
          </table>
        </div>
        {scenarios.length === 0 && <p className="muted small">No saved scenarios yet. Your starting plan is shown on its own.</p>}
      </section>
    </>
  );
}

/* ── Details add-ons: stress test, year table, report ─────────────────────── */
export function WorkspaceDetails({ plan, tier, onReport }) {
  const [open, setOpen] = useState(false);
  const now = useMemo(() => new Date(), []);
  const ok = has(tier, 'plus');
  const stress = useMemo(() => (ok ? stressTests(plan.answers, now) : null), [ok, plan.answers, now]);
  const years = useMemo(() => (ok && open ? yearRows(plan) : []), [ok, open, plan]);
  if (!ok) {
    return <Locked need="plus" title="Go deeper with Workspace" points={[
      'Stress test: what happens if prices rise faster, pay stops rising or you stop work early',
      'Year-by-year balances to age 95, with a download for your own spreadsheet',
      'Set your own assumptions and print a report',
    ]} />;
  }
  const worst = stress.cases.reduce((w, c) => (c.delta < (w?.delta ?? 0) ? c : w), null);
  return (
    <>
      <section className="panel">
        <h2>Stress test</h2>
        <p className="muted">Your plan re-run with one thing going wrong each time. Monthly income in today&rsquo;s dollars; your plan gives {money(stress.base.incomeToday)}.</p>
        <ul className="stress">
          {stress.cases.map((c) => {
            const share = stress.base.incomeToday > 0 ? Math.max(0, Math.min(1, c.incomeToday / stress.base.incomeToday)) : 0;
            return (
              <li key={c.key}>
                <span className="stress-label">{c.label}</span>
                <span className="meter" aria-hidden="true"><i style={{ width: pct(share) }} /></span>
                <b className="fig">{money(c.incomeToday)}</b>
                <small className={c.delta < -1 ? 'loss' : 'muted'}>{signed(c.delta)}</small>
              </li>
            );
          })}
        </ul>
        {worst && <p className="verdict short">Biggest risk: {worst.label.charAt(0).toLowerCase() + worst.label.slice(1)}. That costs about {money(-worst.delta)} a month{worst.gapToday > 0 ? ` and leaves a gap of ${money(worst.gapToday)}` : ', and you would still meet your target'}.</p>}
        <p className="small muted">The Ordinary Account earns at least 2.5% a year by law. The 4% floor on the other accounts is set by the Government and reviewed from time to time. A lower rate is not tested here.</p>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Year by year</h2>
          <div className="btn-row">
            <button type="button" className="btn btn-secondary" aria-expanded={open} onClick={() => setOpen((v) => !v)}>{open ? 'Hide table' : 'Show table'}</button>
            <button type="button" className="btn btn-secondary" onClick={() => download('fusion-cpf-by-year.csv', toCsv(yearRows(plan)), 'text/csv')}>Download CSV</button>
            <button type="button" className="btn btn-primary" onClick={onReport}>Open report</button>
          </div>
        </div>
        {open && <>
          <p className="muted small">Balances at the end of each year of age, in that year&rsquo;s dollars. From the payout age the Retirement Account funds CPF LIFE.</p>
          <div className="table-scroll tall">
            <table className="data">
              <thead><tr><th scope="col">Age</th><th scope="col">Year</th><th scope="col">Ordinary</th><th scope="col">Special / Retirement</th><th scope="col">MediSave</th><th scope="col">Total</th></tr></thead>
              <tbody>{years.map((r) => <tr key={r.age}><th scope="row">{r.age}</th><td>{r.year}</td><td>{money(r.oa)}</td><td>{money(r.retire)}</td><td>{money(r.ma)}</td><td>{money(r.total)}</td></tr>)}</tbody>
            </table>
          </div>
        </>}
      </section>
    </>
  );
}

/* ── Profile add-ons ──────────────────────────────────────────────────────── */
export function Assumptions({ answers, setAnswer, tier }) {
  if (!has(tier, 'plus')) return null;
  const changed = answers.inflation !== 2 || answers.realPayGrowth !== 0 || answers.sumGrowth !== 3;
  return (
    <section className="panel">
      <div className="panel-head"><h2>Assumptions</h2>{changed && <button type="button" className="link" onClick={() => setAnswer({ inflation: 2, realPayGrowth: 0, sumGrowth: 3 })}>Back to standard</button>}</div>
      <p className="muted">The standard settings suit most people. Change them only if you have a reason to.</p>
      <div className="fields three">
        <Slider id="as-infl" label="Prices rise each year by" value={answers.inflation} min={0} max={5} step={0.5} onChange={(v) => setAnswer({ inflation: v })} format={(v) => `${v}%`} />
        <Slider id="as-pay" label="Pay rises faster than prices by" value={answers.realPayGrowth} min={-2} max={4} step={0.5} onChange={(v) => setAnswer({ realPayGrowth: v })} format={(v) => `${v}%`} />
        <Slider id="as-sum" label="Retirement sums rise each year by" value={answers.sumGrowth} min={0} max={5} step={0.5} onChange={(v) => setAnswer({ sumGrowth: v })} format={(v) => `${v}%`} />
      </div>
    </section>
  );
}

export function UpgradeCode({ tier, onTier }) {
  const [code, setCode] = useState(''), [msg, setMsg] = useState(null);
  if (tier === 'pro') return null;
  const submit = (e) => {
    e.preventDefault();
    const t = tierForUpgradeCode(code.trim());
    if (t && PLAN_RANK[t] > PLAN_RANK[tier]) { onTier(t); setCode(''); setMsg({ ok: true, text: `${tierName(t)} is now unlocked on this device.` }); }
    else setMsg({ ok: false, text: t ? 'That code is for the plan you already have.' : 'That code was not recognised.' });
  };
  return (
    <section className="panel">
      <h2>Your plan: {tierName(tier)}</h2>
      <p className="muted">{tier === 'lite' ? 'Workspace adds scenario comparison, stress tests, a year-by-year table and reports. Adviser adds client files.' : 'Adviser adds client files and client reports with your firm name.'} <a href="/pricing/" target="_blank" rel="noopener">See plans and prices ↗</a></p>
      <form className="save-row" onSubmit={submit}>
        <label className="fld" htmlFor="up-code"><span className="field-label">Upgrade code</span>
          <input id="up-code" type="password" autoComplete="off" value={code} onChange={(e) => { setCode(e.target.value); setMsg(null); }} /></label>
        <button type="submit" className="btn btn-secondary">Apply code</button>
      </form>
      {msg && <p className={msg.ok ? 'gain' : 'error'} role="status">{msg.text}</p>}
    </section>
  );
}

/* ── Adviser: client files ────────────────────────────────────────────────── */
export function ClientsView({ book, setBook, clientId, onOpen, onAdd, onClose, onDeleted }) {
  const [name, setName] = useState(''), [msg, setMsg] = useState(null);
  const add = (e) => { e.preventDefault(); if (name.trim()) { onAdd(name.trim().slice(0, 40)); setName(''); } };
  const remove = (c) => {
    if (!window.confirm(`Delete ${c.name}'s file from this device? This cannot be undone.`)) return;
    setBook((b) => ({ ...b, clients: b.clients.filter((x) => x.id !== c.id) })); onDeleted(c.id);
  };
  const rename = (c) => {
    const n = window.prompt('Client name', c.name);
    if (n && n.trim()) setBook((b) => ({ ...b, clients: b.clients.map((x) => (x.id === c.id ? { ...x, name: n.trim().slice(0, 40) } : x)) }));
  };
  const restore = async (e) => {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    try {
      const raw = JSON.parse(await file.text());
      if (!raw || raw.kind !== 'fusion-clients' || !Array.isArray(raw.clients)) throw new Error('not a backup');
      const incoming = raw.clients.filter((c) => c && typeof c.id === 'string').map((c) => ({ id: c.id, name: String(c.name || 'Client').slice(0, 40), notes: String(c.notes || ''), updated: String(c.updated || ''), state: cleanState(c.state) }));
      setBook((b) => {
        const ids = new Set(incoming.map((c) => c.id));
        return { adviser: b.adviser.name || b.adviser.firm ? b.adviser : { name: String(raw.adviser?.name || ''), firm: String(raw.adviser?.firm || '') }, clients: [...b.clients.filter((c) => !ids.has(c.id)), ...incoming] };
      });
      setMsg({ ok: true, text: `Restored ${incoming.length} client file${incoming.length === 1 ? '' : 's'}.` });
    } catch { setMsg({ ok: false, text: 'That file is not a Fusion client backup.' }); }
  };
  const backup = () => download(`fusion-clients-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ kind: 'fusion-clients', v: 1, ...book }, null, 1), 'application/json');
  const setAdviser = (patch) => setBook((b) => ({ ...b, adviser: { ...b.adviser, ...patch } }));
  return (
    <>
      <section className="lead compact">
        <p className="eyebrow">Adviser</p>
        <h1>Client files</h1>
        <p className="muted">Files are kept on this device only and are not uploaded. Download a backup regularly, and before clearing your browser data.</p>
      </section>

      <section className="panel">
        <ul className="clients">
          <li className={!clientId ? 'on' : ''}>
            <div><b>My plan</b><span className="small muted">Your own figures, separate from client files</span></div>
            <button type="button" className="btn btn-secondary" onClick={() => onOpen(null)}>{!clientId ? 'Open (current)' : 'Open'}</button>
          </li>
          {book.clients.map((c) => (
            <li key={c.id} className={c.id === clientId ? 'on' : ''}>
              <div><b>{c.name}</b><span className="small muted">{c.state.done ? `Updated ${c.updated.slice(0, 10)}` : 'Setup not finished'}</span></div>
              <span className="cell-actions">
                <button type="button" className="link" onClick={() => rename(c)}>Rename</button>
                <button type="button" className="link danger" onClick={() => remove(c)}>Delete</button>
                <button type="button" className="btn btn-secondary" onClick={() => onOpen(c.id)}>{c.id === clientId ? 'Open (current)' : 'Open'}</button>
              </span>
            </li>
          ))}
        </ul>
        <form className="save-row" onSubmit={add}>
          <label className="fld" htmlFor="cl-name"><span className="field-label">New client</span>
            <input id="cl-name" value={name} maxLength={40} placeholder="Name or reference" onChange={(e) => setName(e.target.value)} /></label>
          <button type="submit" className="btn btn-primary" disabled={!name.trim()}>Add client</button>
        </form>
      </section>

      <section className="panel">
        <h2>On your reports</h2>
        <div className="fields two">
          <label className="fld" htmlFor="ad-name"><span className="field-label">Your name</span><input id="ad-name" value={book.adviser.name} maxLength={60} onChange={(e) => setAdviser({ name: e.target.value })} /></label>
          <label className="fld" htmlFor="ad-firm"><span className="field-label">Firm and licence details</span><input id="ad-firm" value={book.adviser.firm} maxLength={100} onChange={(e) => setAdviser({ firm: e.target.value })} /></label>
        </div>
      </section>

      <section className="panel">
        <h2>Backup</h2>
        <div className="btn-row">
          <button type="button" className="btn btn-secondary" onClick={backup} disabled={book.clients.length === 0}>Download backup</button>
          <label className="btn btn-secondary file-btn">Restore from backup<input type="file" accept="application/json,.json" onChange={restore} /></label>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Back to plan</button>
        </div>
        {msg && <p className={msg.ok ? 'gain' : 'error'} role="status">{msg.text}</p>}
        <p className="small muted">A backup contains your clients&rsquo; financial details. Store it as you would any client record.</p>
      </section>
    </>
  );
}

/* ── Report (print or save as PDF) ────────────────────────────────────────── */
export function ReportView({ plan, base, answers, scenarios, now, tier, client, adviser, setNotes, onBack }) {
  const stress = useMemo(() => stressTests(plan.answers, now), [plan.answers, now]);
  if (!has(tier, 'plus')) return null;
  const pro = tier === 'pro';
  const cols = [{ name: 'Starting plan', s: summarise(base) }, ...scenarios.map((sc) => ({ name: sc.name, s: summarise(buildPlan({ ...answers, ...sc.tried }, now)) }))];
  const a = plan.assumptions, started = plan.age >= plan.payoutAge;
  return (
    <>
      <div className="btn-row no-print">
        <button type="button" className="btn btn-secondary" onClick={onBack}>← Back</button>
        <button type="button" className="btn btn-primary" onClick={() => window.print()}>Print or save as PDF</button>
      </div>
      <article className="panel report">
        <header>
          <p className="eyebrow">CPF retirement estimate · {now.toLocaleDateString('en-SG', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
          <h1>{client ? `Prepared for ${client.name}` : 'Your CPF retirement plan'}</h1>
          {pro && (adviser.name || adviser.firm) && <p className="muted">Prepared by {[adviser.name, adviser.firm].filter(Boolean).join(', ')}</p>}
        </header>

        <h2>The answer</h2>
        <p className="report-lead">{started ? 'CPF LIFE' : `From age ${plan.payoutAge}, CPF LIFE`} is estimated to pay about <b>{money(plan.payoutToday)} a month for life</b>, in today&rsquo;s dollars{started ? '' : ` (${money(plan.payout)} a month in ${plan.yearPayout})`}.
          {plan.oaMonthlyToday > 0 && <> Ordinary Account savings could add {money(plan.oaMonthlyToday)} a month if spread to age 90; this part is not guaranteed for life.</>}
          {plan.target > 0 && (plan.gapToday > 0 ? <> Against a target of {money(plan.target)} a month, the gap is <b>{money(plan.gapToday)} a month</b>.</> : <> This meets the target of {money(plan.target)} a month.</>)}</p>
        <table className="data">
          <tbody>
            <tr><th scope="row">Age today</th><td>{plan.age}</td></tr>
            <tr><th scope="row">CPF balances today (OA / SA or RA / MA)</th><td>{money(answers.oa)} / {money(answers.sa)} / {money(answers.ma)}</td></tr>
            <tr><th scope="row">Full Retirement Sum at 55 ({plan.year55})</th><td>{money(plan.frs55)} · {pct(plan.frsCoverage)} set aside</td></tr>
            <tr><th scope="row">Retirement Account at payout start</th><td>{money(plan.raAtPayout)} ({plan.yearPayout} dollars)</td></tr>
            <tr><th scope="row">Readiness</th><td>{plan.score} / 100 · {plan.label}</td></tr>
          </tbody>
        </table>
        {plan.watch.length > 0 && <><h2>Watch out</h2><ul>{plan.watch.map((w) => <li key={w.key}>{w.text}</li>)}</ul></>}

        {cols.length > 1 && <>
          <h2>Options compared</h2>
          <table className="data">
            <thead><tr><th scope="col">Option</th><th scope="col">Monthly income</th><th scope="col">CPF LIFE</th><th scope="col">Gap</th><th scope="col">Readiness</th></tr></thead>
            <tbody>{cols.map((c) => <tr key={c.name}><th scope="row">{c.name}</th><td>{money(c.s.incomeToday)}</td><td>{money(c.s.payoutToday)}</td><td>{c.s.gapToday > 0 ? money(c.s.gapToday) : 'None'}</td><td>{c.s.score}</td></tr>)}</tbody>
          </table>
        </>}

        <h2>Stress test</h2>
        <table className="data">
          <thead><tr><th scope="col">If this happens</th><th scope="col">Monthly income</th><th scope="col">Change</th></tr></thead>
          <tbody>{stress.cases.map((c) => <tr key={c.key}><th scope="row">{c.label}</th><td>{money(c.incomeToday)}</td><td>{signed(c.delta)}</td></tr>)}</tbody>
        </table>

        {pro && client && <>
          <h2>Adviser notes</h2>
          <textarea className="notes no-print" rows={4} value={client.notes} maxLength={2000} placeholder="Notes for this client. They print on the report." onChange={(e) => setNotes(e.target.value)} aria-label="Adviser notes" />
          <p className="print-only notes-print">{client.notes || '—'}</p>
        </>}

        <h2>Assumptions</h2>
        <ul className="small">
          <li>Prices rise {(a.inflation * 100).toFixed(1)}% a year; pay rises {(a.salaryGrowth * 100).toFixed(1)}% a year until work stops; retirement sums rise {(a.sumGrowth * 100).toFixed(1)}% a year after 2027.</li>
          <li>CPF interest at today&rsquo;s rates. Contribution rates as published for 2026 and 2027.</li>
          <li>CPF LIFE figures are estimates matched to CPF Board&rsquo;s published payouts. CPF Board sets the actual payout when it starts.</li>
        </ul>
        <p className="small muted">An estimate for planning, based on the figures entered. It is not financial advice, not a recommendation to buy any product, and not a statement from CPF Board. Fusion 富生 is not affiliated with CPF Board.</p>
      </article>
    </>
  );
}
