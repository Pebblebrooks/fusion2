/**
 * Adviser plan: the client book and meeting mode.
 *   ClientsView  — the landing screen: every client with headline figures, tags and review date.
 *   MeetingView  — one client's plan as large, read-only pages for sharing a screen. It shows
 *                  nothing about any other client and none of the adviser's notes.
 * Data shape and checks live in src/model/clients.js. Files stay on this device.
 */
import { useEffect, useMemo, useState } from 'react';
import { buildHousehold } from '../model/household.js';
import { cleanBook, cleanTags, clientSummary, reviewStatus, allTags, listClients, reviewAll, reviewCsv, RULES_VERSION, MAX_LOGO_CHARS, DEFAULT_ACCENT } from '../model/clients.js';
import { download } from './storage.js';
import { money, pct } from './ui.jsx';
import { IncomeBar } from './Modules.jsx';

const REVIEW_TEXT = { overdue: 'Review overdue', soon: 'Review due soon', ok: 'Review', none: 'No review date' };
const niceDate = (iso) => (iso ? new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' }) : '');

/* ── Client book ──────────────────────────────────────────────────────────── */
export function ClientsView({ book, setBook, clientId, saved, onOpen, onAdd, onMeeting, onDeleted, now }) {
  const [name, setName] = useState(''), [query, setQuery] = useState(''), [tag, setTag] = useState(''), [sort, setSort] = useState('review');
  const [editing, setEditing] = useState(null), [msg, setMsg] = useState(null), [review, setReview] = useState(null);
  const tags = useMemo(() => allTags(book.clients), [book.clients]);
  const rows = useMemo(() => listClients(book.clients, { query, tag, sort }), [book.clients, query, tag, sort]);
  const summaries = useMemo(() => Object.fromEntries(book.clients.map((c) => [c.id, clientSummary(c, now)])), [book.clients, now]);
  const due = book.clients.filter((c) => reviewStatus(c.reviewDate, now) === 'overdue').length;

  const patch = (id, change) => setBook((b) => ({ ...b, clients: b.clients.map((c) => (c.id === id ? { ...c, ...change } : c)) }));
  const add = (e) => { e.preventDefault(); if (name.trim()) { onAdd(name.trim().slice(0, 40)); setName(''); } };
  const remove = (c) => {
    if (!window.confirm(`Delete ${c.name}'s file and advice record from this device? This cannot be undone.`)) return;
    setBook((b) => ({ ...b, clients: b.clients.filter((x) => x.id !== c.id) })); onDeleted(c.id); setEditing(null);
  };
  const setAdviser = (change) => setBook((b) => ({ ...b, adviser: { ...b.adviser, ...change } }));
  const pickLogo = (e) => {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) { setMsg({ ok: false, text: 'Use a PNG, JPEG or WebP image for the logo.' }); return; }
    const reader = new FileReader();
    reader.onload = () => {
      if (String(reader.result).length > MAX_LOGO_CHARS) setMsg({ ok: false, text: 'That image is too large. Use one under 200 KB.' });
      else { setAdviser({ logo: String(reader.result) }); setMsg({ ok: true, text: 'Logo added. It appears on client reports.' }); }
    };
    reader.readAsDataURL(file);
  };
  const restore = async (e) => {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    try {
      const raw = JSON.parse(await file.text());
      if (!raw || raw.kind !== 'fusion-clients') throw new Error('not a backup');
      const incoming = cleanBook(raw);
      setBook((b) => {
        const ids = new Set(incoming.clients.map((c) => c.id));
        return { adviser: b.adviser.name || b.adviser.firm || b.adviser.logo ? b.adviser : incoming.adviser, clients: [...b.clients.filter((c) => !ids.has(c.id)), ...incoming.clients] };
      });
      setMsg({ ok: true, text: `Restored ${incoming.clients.length} client file${incoming.clients.length === 1 ? '' : 's'}.` });
    } catch { setMsg({ ok: false, text: 'That file is not a Fusion client backup.' }); }
  };
  const backup = () => download(`fusion-clients-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ kind: 'fusion-clients', v: 2, ...book }, null, 1), 'application/json');

  return (
    <>
      <section className="lead compact">
        <p className="eyebrow">Adviser</p>
        <h1>{book.clients.length === 0 ? 'Add your first client.' : `${book.clients.length} client${book.clients.length === 1 ? '' : 's'}${due ? `, ${due} review${due === 1 ? '' : 's'} overdue` : ''}.`}</h1>
        <p className="muted">Client files are kept on this device only. Download a backup regularly, and before clearing your browser data.</p>
        {!saved && <p className="error" role="alert">This device&rsquo;s storage is full, so the latest changes are not saved. Download a backup now, then remove the logo or old client files.</p>}
      </section>

      <section className="panel">
        <form className="save-row" onSubmit={add}>
          <label className="fld" htmlFor="cl-name"><span className="field-label">New client</span>
            <input id="cl-name" value={name} maxLength={40} placeholder="Name or reference" onChange={(e) => setName(e.target.value)} /></label>
          <button type="submit" className="btn btn-primary" disabled={!name.trim()}>Add client</button>
        </form>
      </section>

      <section className="panel">
        {book.clients.length > 3 && <div className="book-tools">
          <label className="fld" htmlFor="cl-q"><span className="field-label">Search</span><input id="cl-q" type="search" value={query} placeholder="Name or tag" onChange={(e) => setQuery(e.target.value)} /></label>
          <label className="fld" htmlFor="cl-tag"><span className="field-label">Tag</span><select id="cl-tag" value={tag} onChange={(e) => setTag(e.target.value)}><option value="">All</option>{tags.map((t) => <option key={t}>{t}</option>)}</select></label>
          <label className="fld" htmlFor="cl-sort"><span className="field-label">Sort by</span><select id="cl-sort" value={sort} onChange={(e) => setSort(e.target.value)}><option value="review">Review date</option><option value="name">Name</option><option value="updated">Last changed</option></select></label>
        </div>}
        <ul className="clients">
          {rows.map((c) => {
            const s = summaries[c.id], rs = reviewStatus(c.reviewDate, now), open = editing === c.id;
            return (
              <li key={c.id} className={c.id === clientId ? 'on' : ''}>
                <div className="client-main">
                  <b>{c.name}</b>
                  <span className="small muted">
                    {s ? <>{money(s.incomeToday)} a month{s.target > 0 ? (s.gapToday > 0 ? ` · ${money(s.gapToday)} short of target` : ' · meets target') : ''} · {s.label}</> : 'Setup not finished'}
                  </span>
                  <span className="chips">
                    <span className={`chip review-${rs}`}>{REVIEW_TEXT[rs]}{rs !== 'none' ? ` ${niceDate(c.reviewDate)}` : ''}</span>
                    {c.tags.map((t) => <span key={t} className="chip">{t}</span>)}
                    {c.log.length > 0 && <span className="chip">{c.log.length} report{c.log.length === 1 ? '' : 's'} issued</span>}
                  </span>
                </div>
                <span className="cell-actions">
                  <button type="button" className="link" aria-expanded={open} onClick={() => setEditing(open ? null : c.id)}>{open ? 'Close' : 'Edit details'}</button>
                  {s && <button type="button" className="btn btn-secondary" onClick={() => onMeeting(c.id)}>Meeting</button>}
                  <button type="button" className="btn btn-primary" onClick={() => onOpen(c.id)}>Open</button>
                </span>
                {open && <div className="client-edit">
                  <label className="fld" htmlFor={`n-${c.id}`}><span className="field-label">Name</span><input id={`n-${c.id}`} value={c.name} maxLength={40} onChange={(e) => patch(c.id, { name: e.target.value })} /></label>
                  <label className="fld" htmlFor={`t-${c.id}`}><span className="field-label">Tags, separated by commas</span><input id={`t-${c.id}`} defaultValue={c.tags.join(', ')} placeholder="e.g. pre-retiree, couple" onBlur={(e) => patch(c.id, { tags: cleanTags(e.target.value) })} /></label>
                  <label className="fld" htmlFor={`r-${c.id}`}><span className="field-label">Next review</span><input id={`r-${c.id}`} type="date" value={c.reviewDate} onChange={(e) => patch(c.id, { reviewDate: e.target.value })} /></label>
                  <button type="button" className="link danger" onClick={() => remove(c)}>Delete this client</button>
                  {c.log.length > 0 && <div className="log">
                    <p className="field-label">Advice record</p>
                    <ol>{c.log.map((e) => <li key={e.at}><b>{niceDate(e.at)}</b> · {money(e.income)} a month{e.target > 0 ? ` against ${money(e.target)}` : ''} · readiness {e.score} · rules {e.rules || 'before versioning'}{e.recommendation ? <><br /><span className="muted">{e.recommendation}</span></> : null}</li>)}</ol>
                  </div>}
                </div>}
              </li>
            );
          })}
          {book.clients.length > 0 && rows.length === 0 && <li><span className="muted">No clients match that search.</span></li>}
          <li className={!clientId ? 'on mine' : 'mine'}>
            <div className="client-main"><b>My plan</b><span className="small muted">Your own figures, kept apart from client files. Useful as a demonstration.</span></div>
            <span className="cell-actions"><button type="button" className="btn btn-secondary" onClick={() => onOpen(null)}>Open</button></span>
          </li>
        </ul>
      </section>

      {book.clients.some((c) => c.state.done) && <section className="panel">
        <div className="panel-head">
          <h2>Review all clients</h2>
          <div className="btn-row">
            <button type="button" className="btn btn-secondary" onClick={() => setReview(reviewAll(book.clients, now))}>{review ? 'Run again' : 'Run review'}</button>
            {review && <button type="button" className="btn btn-secondary" onClick={() => download(`fusion-client-review-${new Date().toISOString().slice(0, 10)}.csv`, reviewCsv(review), 'text/csv')}>Download CSV</button>}
          </div>
        </div>
        <p className="muted">Re-runs every finished plan under the current rules (checked {RULES_VERSION}) and compares it with the figures in each client&rsquo;s last issued report.</p>
        {review && <div className="table-scroll">
          <table className="data">
            <thead><tr><th scope="col">Client</th><th scope="col">Income now</th><th scope="col">In last report</th><th scope="col">Change</th><th scope="col">Status</th></tr></thead>
            <tbody>{review.map((r) => (
              <tr key={r.id}>
                <th scope="row">{r.name}</th><td>{money(r.incomeToday)}</td>
                <td>{r.lastIncome === null ? '—' : <>{money(r.lastIncome)}<small className="muted"> · {niceDate(r.lastAt)}</small></>}</td>
                <td>{r.change === null ? '—' : `${r.change > 0 ? '+' : r.change < 0 ? '−' : ''}${money(Math.abs(r.change))}${r.pctChange !== null ? ` (${Math.abs(r.pctChange * 100).toFixed(1)}%)` : ''}`}</td>
                <td><span className={`chip ${r.flag === 'crossed' ? 'review-overdue' : r.flag === 'moved' || r.flag === 'rules' ? 'review-soon' : ''}`}>{{ crossed: r.gapToday > 0 ? 'Now below target' : 'Now meets target', moved: 'Income moved over 5%', rules: 'Rules updated since report', none: 'No report issued', '': 'No change to act on' }[r.flag]}</span></td>
              </tr>
            ))}</tbody>
          </table>
        </div>}
      </section>}

      <section className="panel">
        <h2>On your reports</h2>
        <div className="fields two">
          <label className="fld" htmlFor="ad-name"><span className="field-label">Your name</span><input id="ad-name" value={book.adviser.name} maxLength={60} onChange={(e) => setAdviser({ name: e.target.value })} /></label>
          <label className="fld" htmlFor="ad-firm"><span className="field-label">Firm and licence details</span><input id="ad-firm" value={book.adviser.firm} maxLength={100} onChange={(e) => setAdviser({ firm: e.target.value })} /></label>
        </div>
        <div className="brand-row">
          {book.adviser.logo ? <img className="logo-preview" src={book.adviser.logo} alt="Your logo" /> : <span className="logo-preview empty">No logo</span>}
          <label className="btn btn-secondary file-btn">{book.adviser.logo ? 'Change logo' : 'Add logo'}<input type="file" accept="image/png,image/jpeg,image/webp" onChange={pickLogo} /></label>
          {book.adviser.logo && <button type="button" className="link danger" onClick={() => setAdviser({ logo: '' })}>Remove logo</button>}
          <label className="fld colour" htmlFor="ad-accent"><span className="field-label">Report colour</span><input id="ad-accent" type="color" value={book.adviser.accent || DEFAULT_ACCENT} onChange={(e) => setAdviser({ accent: e.target.value })} /></label>
        </div>
      </section>

      <section className="panel">
        <h2>Backup</h2>
        <div className="btn-row">
          <button type="button" className="btn btn-secondary" onClick={backup} disabled={book.clients.length === 0}>Download backup</button>
          <label className="btn btn-secondary file-btn">Restore from backup<input type="file" accept="application/json,.json" onChange={restore} /></label>
        </div>
        {msg && <p className={msg.ok ? 'gain' : 'error'} role="status">{msg.text}</p>}
        <p className="small muted">A backup holds your clients&rsquo; financial details and advice records. Store it as you would any client record.</p>
      </section>
    </>
  );
}

/* ── Meeting mode ─────────────────────────────────────────────────────────── */
export function MeetingView({ plan, moves, name, onExit, now }) {
  const hh = useMemo(() => buildHousehold(plan.answers, now), [plan.answers, now]);
  const joint = !!hh.partner, s = plan.sale;
  const bar = { payoutToday: hh.lifeToday, oaMonthlyToday: plan.oaMonthlyToday + (joint ? hh.partner.oaMonthlyToday : 0), otherMonthlyToday: plan.otherMonthlyToday, gapToday: hh.gapToday, target: hh.target, incomeToday: hh.incomeToday, spreadTo: plan.spreadTo };
  const pages = [
    { key: 'answer', title: 'Where you stand', body: (<>
      <h1>{joint ? 'Together, CPF is set to pay you about ' : 'CPF is set to pay you about '}<span className="fig">{money(hh.incomeToday)}</span> a month.</h1>
      <p className="meet-sub">{money(hh.lifeToday)} of it is CPF LIFE, paid for as long as you live. All figures are in today&rsquo;s dollars.</p>
      <IncomeBar p={bar} />
      {hh.target > 0 && <p className={`verdict ${hh.gapToday === 0 ? 'ok' : 'short'}`}>{hh.gapToday === 0 ? `This covers your target of ${money(hh.target)} a month.` : `Your target is ${money(hh.target)} a month. This is ${money(hh.gapToday)} short.`}</p>}
    </>) },
    joint && { key: 'household', title: 'Each of you', body: (<>
      <h1>Each of you has your own CPF LIFE payout.</h1>
      <div className="meet-two">
        <div><p className="eyebrow">You</p><p className="meet-fig fig">{money(hh.you.incomeToday)}</p><p>a month, {money(hh.you.payoutToday)} of it for life from {hh.you.payoutAge}</p></div>
        <div><p className="eyebrow">Your partner</p><p className="meet-fig fig">{money(hh.partner.incomeToday)}</p><p>a month, {money(hh.partner.payoutToday)} of it for life from {hh.partner.payoutAge}</p></div>
      </div>
      <p className="meet-sub">A payout stops when that person dies. Savings left go to the people named in each CPF nomination.</p>
    </>) },
    s && !s.shortfall && { key: 'property', title: 'Your home', body: (<>
      <h1>Selling at {s.age} would leave about <span className="fig">{money(s.resources)}</span> after your next home.</h1>
      <ul className="delta-list big">
        <li><span>Sale price in {s.year}</span><b>{money(s.price)}</b></li>
        {s.nextCost > 0 && <li><span>Next home</span><b>− {money(s.nextCost)}</b></li>}
        <li><span>Back in your CPF</span><b>{money(s.inCpf)}</b></li>
        <li><span>Cash in hand</span><b>{money(s.cash)}</b></li>
        {s.shb && <li><span>Silver Housing Bonus, included above</span><b>{money(s.bonus)}</b></li>}
      </ul>
      <p className="meet-sub">Figures in {s.year} dollars. Selling costs and stamp duty are not included.</p>
    </>) },
    moves.length > 0 && { key: 'moves', title: 'What would help most', body: (<>
      <h1>Three things that would raise your income most.</h1>
      <ol className="meet-moves">{moves.map((m, i) => <li key={m.key}><span className="rank" aria-hidden="true">{i + 1}</span><div><b>{m.title}</b><p><span className="gain">+{money(m.gain)} a month</span> · {m.cost}. {m.catch}</p></div></li>)}</ol>
      <p className="meet-sub">Each figure is that step on its own.</p>
    </>) },
    { key: 'basis', title: 'What this assumes', body: (<>
      <h1>How these figures were worked out.</h1>
      <ul className="meet-list">
        <li>Prices rise {(plan.assumptions.inflation * 100).toFixed(1)}% a year, and pay rises {(plan.assumptions.salaryGrowth * 100).toFixed(1)}% a year until work stops.</li>
        <li>CPF interest stays at today&rsquo;s rates, and contribution rates are those published for 2026 and 2027.</li>
        <li>Readiness is {plan.score} out of 100: {plan.parts.map((p) => `${p.label.toLowerCase()} ${pct(p.value)}`).join('; ')}.</li>
        <li>CPF LIFE figures are estimates. CPF Board sets the actual payout when it starts.</li>
      </ul>
      <p className="meet-sub">An estimate for planning. It is not a statement from CPF Board.</p>
    </>) },
  ].filter(Boolean);
  const [i, setI] = useState(0);
  const page = pages[Math.min(i, pages.length - 1)];
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onExit();
      if (e.key === 'ArrowRight' || e.key === 'PageDown') setI((v) => Math.min(pages.length - 1, v + 1));
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') setI((v) => Math.max(0, v - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pages.length, onExit]);
  return (
    <div className="meeting" role="region" aria-label="Meeting mode">
      <header className="meet-head">
        <span className="brand"><span className="brand-mark" aria-hidden="true">富</span><span>{name ? `Prepared for ${name}` : 'Your CPF plan'}</span></span>
        <span className="muted">{page.title} · {Math.min(i, pages.length - 1) + 1} of {pages.length}</span>
        <button type="button" className="btn btn-secondary" onClick={onExit}>End meeting</button>
      </header>
      <main className="meet-page" key={page.key} aria-live="polite">{page.body}</main>
      <footer className="meet-foot">
        <button type="button" className="btn btn-secondary" disabled={i === 0} onClick={() => setI(i - 1)}>← Back</button>
        <span className="dots" aria-hidden="true">{pages.map((p, k) => <i key={p.key} className={k === i ? 'on' : ''} />)}</span>
        <button type="button" className="btn btn-primary" disabled={i >= pages.length - 1} onClick={() => setI(i + 1)}>Next →</button>
      </footer>
    </div>
  );
}
