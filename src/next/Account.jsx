/**
 * Accounts in the new planner (proof of concept): sign in / create account, and the
 * Account panel under Profile. Payments are simulated on the checkout page.
 */
import { useState } from 'react';
import { accountApi } from './storage.js';

/** Email + password form. mode: 'signin' | 'register'. Calls onDone(user) on success. */
export function AccountForm({ mode, onMode, onDone, idPrefix = 'acc' }) {
  const [email, setEmail] = useState(''), [pw, setPw] = useState(''), [msg, setMsg] = useState(null), [busy, setBusy] = useState(false);
  const reg = mode === 'register';
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setMsg(null);
    const r = reg ? await accountApi.register(email, pw) : await accountApi.login(email, pw);
    setBusy(false);
    if (r.ok) onDone(r.user); else setMsg(r.message || 'Something went wrong. Please try again.');
  };
  return (
    <form className="account-form" onSubmit={submit}>
      <label className="fld" htmlFor={`${idPrefix}-email`}><span className="field-label">Email</span>
        <input id={`${idPrefix}-email`} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
      <label className="fld" htmlFor={`${idPrefix}-pw`}><span className="field-label">Password</span>
        <input id={`${idPrefix}-pw`} type="password" autoComplete={reg ? 'new-password' : 'current-password'} required minLength={reg ? 10 : undefined} value={pw} onChange={(e) => setPw(e.target.value)} /></label>
      {reg && <p className="field-hint">At least 10 characters. There is no password reset by email yet, so keep it somewhere safe.</p>}
      {msg && <p className="error" role="alert">{msg}</p>}
      <button className="btn btn-primary btn-block" type="submit" disabled={busy}>{busy ? 'Please wait…' : reg ? 'Create account' : 'Sign in'}</button>
      <p className="small muted">{reg ? <>Have an account? <button type="button" className="link" onClick={() => onMode('signin')}>Sign in</button></>
        : <>New here? <button type="button" className="link" onClick={() => onMode('register')}>Create an account</button></>}</p>
    </form>
  );
}

/** Profile → Account. account: { available, signedIn, user }. */
export function AccountPanel({ account, onAccount }) {
  const [mode, setMode] = useState('register'), [del, setDel] = useState(false), [pw, setPw] = useState(''), [msg, setMsg] = useState(null);
  if (!account || !account.available) return null;
  const u = account.user;
  if (!account.signedIn) {
    return (
      <section className="panel">
        <h2>Account</h2>
        <p className="muted">You are using a beta code. Create an account to keep your plan level on any device and to try the test checkout. Your planning answers stay on this device either way.</p>
        <AccountForm mode={mode} onMode={setMode} idPrefix="prof" onDone={(user) => onAccount({ available: true, signedIn: true, user })} />
      </section>
    );
  }
  const cancel = async () => {
    if (!window.confirm(`Cancel your ${u.planName} plan and return to Guided? This is a test plan, so nothing is refunded or charged.`)) return;
    const r = await accountApi.cancelPlan();
    if (r.ok) { onAccount({ ...account, user: r.user }); setMsg({ ok: true, text: 'Your plan is now Guided.' }); } else setMsg({ ok: false, text: r.message });
  };
  const remove = async (e) => {
    e.preventDefault();
    const r = await accountApi.deleteAccount(pw);
    if (r.ok) { window.alert('Your account has been deleted. Planning answers on this device are not affected.'); window.location.assign('/logout'); }
    else setMsg({ ok: false, text: r.message });
  };
  return (
    <section className="panel">
      <h2>Account</h2>
      <dl className="acct">
        <div><dt>Email</dt><dd>{u.email}</dd></div>
        <div><dt>Plan</dt><dd>{u.planName}{u.interval ? `, billed ${u.interval === 'year' ? 'yearly' : 'monthly'} (test)` : ''}</dd></div>
      </dl>
      <div className="btn-row">
        <a className="btn btn-secondary" href="/pricing/" target="_blank" rel="noopener">{u.tier === 'lite' ? 'Upgrade (test payment) ↗' : 'Change plan ↗'}</a>
        {u.tier !== 'lite' && <button type="button" className="btn btn-ghost" onClick={cancel}>Cancel plan</button>}
        <button type="button" className="btn btn-ghost danger" aria-expanded={del} onClick={() => { setDel((v) => !v); setMsg(null); }}>Delete my account</button>
      </div>
      {del && <form className="save-row" onSubmit={remove}>
        <label className="fld" htmlFor="del-pw"><span className="field-label">Enter your password to delete your account</span>
          <input id="del-pw" type="password" autoComplete="current-password" required value={pw} onChange={(e) => setPw(e.target.value)} /></label>
        <button type="submit" className="btn btn-secondary danger">Delete permanently</button>
        <p className="field-hint">This removes your email, plan and test payment records from our server. It cannot be undone.</p>
      </form>}
      {msg && <p className={msg.ok ? 'gain' : 'error'} role="status">{msg.text}</p>}
      <p className="small muted">Payments in this preview are simulated. No money is taken.</p>
    </section>
  );
}
