/**
 * Chapters 4 (Home), 7 (Later life) and 8 (Legacy). Same scene rules as the other chapters.
 * Facts about the home are saved straight away (like Today); choices (selling, health assumptions,
 * how to spend the Ordinary Account) are tried first and kept as moves.
 */
import { useDeferredValue, useMemo } from 'react';
import { homeScene, laterScene, legacyScene } from '../model/studio.js';
import { runConfidence } from '../model/household.js';
import { MoneyField, Slider, Choice, money, pct } from '../next/ui.jsx';
import { Scene, TrialBar, ShowHow, SceneNav } from './shared.jsx';

const signed = (v) => `${v >= 0 ? '+' : '−'}${money(Math.abs(v))}`;

/* ── Chapter 4: Home ─────────────────────────────────────────────────────── */
export function HomeChapter({ base, plan, val, lever, trial, onPick, onFact, now }) {
  const s = useMemo(() => homeScene(plan, now), [plan, now]);
  const a = base.answers, age = plan.age;
  const selling = val('sellHomeAge') > age;
  return (
    <Scene id="home">
      <section className="st-answer panel">
        {s.monthly > 0 ? (
          <>
            <p className="st-big"><span className="fig">{money(s.monthly)}</span> <span className="st-unit">a month from your Ordinary Account</span></p>
            <p className="st-sub">For your home loan, until {s.loanEnds}{s.usedSoFar > 0 ? `, on top of ${money(s.usedSoFar)} used so far` : ''}.</p>
          </>
        ) : s.owns ? (
          <>
            <p className="st-big"><span className="fig">{money(s.usedSoFar)}</span> <span className="st-unit">of CPF used on your home so far</span></p>
            <p className="st-sub">No monthly loan payments from CPF in your plan.</p>
          </>
        ) : (
          <p className="st-big"><span className="st-unit">No home in your plan yet.</span></p>
        )}
        <p className="st-meaning">
          {s.monthly > 0 && <>Your loan takes about <b>{money(s.loanLeft)}</b> more from your Ordinary Account, in the dollars of each year. Without it, your monthly income from {plan.payoutAge} would be <b>{money(Math.abs(s.loanEffect))} higher</b>. </>}
          {s.owns && <>When you sell, the CPF you used comes back to your CPF with 2.5% a year interest; from 55 it first fills your Retirement Account up to the Full Retirement Sum.</>}
          {!s.owns && <>Add your home below to see what it does to your CPF.</>}
        </p>
        {s.oaShort && <p className="st-warn" role="note">{s.oaShort.text}</p>}
      </section>

      <section className="panel st-levers" aria-labelledby="st-home-h">
        <h2 id="st-home-h">Your home</h2>
        <p className="muted small">Facts, saved to your plan as you type.</p>
        <Choice label="Do you own your home?" name="st-owns" value={a.ownsHome} onChange={(v) => onFact({ ownsHome: v })} options={[[false, 'No'], [true, 'Yes']]} />
        {a.ownsHome && (
          <div className="st-lever-grid">
            <MoneyField id="st-hv" label="What it is worth today" value={a.homeValue} onChange={(v) => onFact({ homeValue: v })} />
            <MoneyField id="st-used" label="CPF used so far, with accrued interest" value={a.cpfUsedForHome} onChange={(v) => onFact({ cpfUsedForHome: v })} hint="On your CPF statement under Home ownership. Your share only." />
            <MoneyField id="st-loan" label="Home loan paid from CPF each month" value={a.housingMonthly} onChange={(v) => onFact({ housingMonthly: v })} hint="Leave at 0 if paid off or paid in cash." />
            {a.housingMonthly > 0 && <Slider id="st-loanend" label="Loan paid off at age" value={a.housingEndAge} min={age + 1} max={85} step={1} onChange={(v) => onFact({ housingEndAge: v })} format={(v) => `${v}`} />}
          </div>
        )}
      </section>

      {a.ownsHome && (
        <section className="st-levers panel" aria-labelledby="st-levers-h">
          <h2 id="st-levers-h">Try selling or right-sizing</h2>
          <p className="muted small">Nothing is saved until you choose Save this move.</p>
          <Choice label="Plan" name="st-sell" value={selling} onChange={(v) => lever('sellHomeAge', v ? Math.max(age + 1, 65) : 0)} options={[[false, 'Keep it'], [true, 'Sell it']]} />
          {selling && (
            <div className="st-lever-grid">
              <Slider id="l-sellage" label="Sell when you are" value={val('sellHomeAge')} min={age + 1} max={90} step={1} onChange={(v) => lever('sellHomeAge', v)} format={(v) => `${v}`} />
              <MoneyField id="l-next" label="Cost of your next home" value={val('nextHomeCost')} onChange={(v) => lever('nextHomeCost', v)} suffix="today's prices" hint="Leave at 0 if you will rent or live with family." />
              <MoneyField id="l-owed" label="Home loan still owed then" value={val('loanOwedAtSale')} onChange={(v) => lever('loanOwedAtSale', v)} hint="Leave at 0 if it will be paid off." />
            </div>
          )}
          {selling && s.shbOpen && (
            <>
              <Choice label="Silver Housing Bonus: moving to a 3-room or smaller HDB flat?" name="st-shb" value={val('shb')} onChange={(v) => lever('shb', v)} options={[[false, 'No'], [true, 'Yes']]} />
              {val('shb') && (
                <div className="st-lever-grid">
                  <Choice label="Next flat" name="st-shbflat" value={val('shbNextFlat')} onChange={(v) => lever('shbNextFlat', v)} options={[['3r', '3-room'], ['2r', '2-room or smaller']]} />
                  <Slider id="l-commit" label="Commit to your Retirement Account" value={val('shbCommit')} min={0} max={s.shbMaxCommit} step={5000} onChange={(v) => lever('shbCommit', v)} format={money} />
                </div>
              )}
            </>
          )}
          {selling && !s.shbOpen && <p className="muted small">The Silver Housing Bonus is for Singapore Citizens selling at {s.shbMinAge} or older and moving to a 3-room or smaller HDB flat.</p>}
          <TrialBar {...trial} base={base} plan={plan} />
        </section>
      )}

      <ShowHow>
        {s.sale && s.sale.refund !== null ? (
          <>
            <table className="st-table">
              <caption className="visually-hidden">Where the sale money goes at {s.sale.age}</caption>
              <thead><tr><th scope="col">Selling at {s.sale.age}, in {s.sale.year} dollars</th><th scope="col">Amount</th></tr></thead>
              <tbody>
                <tr><th scope="row">Sale price</th><td className="fig">{money(s.sale.price)}</td></tr>
                {s.sale.loanOwed > 0 && <tr><th scope="row">Home loan repaid</th><td className="fig">− {money(s.sale.loanOwed)}</td></tr>}
                {s.sale.nextCost > 0 && <tr><th scope="row">Next home</th><td className="fig">− {money(s.sale.nextCost)}</td></tr>}
                {s.sale.shb && <tr><th scope="row">Committed to Retirement Account</th><td className="fig">− {money(s.sale.committed)}</td></tr>}
                {s.sale.shb && <tr><th scope="row">Silver Housing Bonus (cash)</th><td className="fig">+ {money(s.sale.bonus)}</td></tr>}
                <tr className="st-total"><th scope="row">{s.sale.resources >= 0 ? 'Left over' : 'Shortfall'}</th><td className="fig">{money(Math.abs(s.sale.resources))}</td></tr>
                {s.sale.resources >= 0 && <tr><th scope="row">of which back in your CPF</th><td className="fig">{money(s.sale.inCpf)}</td></tr>}
                {s.sale.resources >= 0 && <tr><th scope="row">of which cash in hand</th><td className="fig">{money(s.sale.cash)}</td></tr>}
              </tbody>
            </table>
            <ul className="st-notes">
              <li>The sale changes monthly income by {signed(s.saleEffect)}: CPF LIFE {signed(s.saleParts.life)}, Ordinary Account {signed(s.saleParts.oa)}, cash from the sale spread to {plan.spreadTo} {signed(s.saleParts.other)}.</li>
              <li>You must return {money(s.sale.refund)} to your CPF: what you used plus 2.5% a year interest. Selling costs and stamp duty are not included.</li>
            </ul>
          </>
        ) : <p className="muted">Choose Sell it above to see where the money would go.</p>}
        <ul className="st-notes">
          <li>Silver Housing Bonus: HDB pays S$1 in cash for every S$2 committed to the Retirement Account, up to S$30,000, plus S$10,000 for a 2-room or smaller flat. Household income must be S$14,000 a month or less; HDB confirms the amount.</li>
          <li>Home value is assumed to rise {a.homeGrowth}% a year. Change it in the planner under Property.</li>
        </ul>
      </ShowHow>
      <SceneNav id="home" onPick={onPick} />
    </Scene>
  );
}

/* ── Chapter 7: Later life ───────────────────────────────────────────────── */
export function LaterChapter({ base, plan, val, lever, trial, onPick, now }) {
  const s = useMemo(() => laterScene(plan, now), [plan, now]);
  // 500 simulated runs take a moment, so they follow the levers a beat behind.
  const answers = useDeferredValue(plan.answers);
  const conf = useMemo(() => runConfidence(answers, now), [answers, now]);
  const h = s.health;
  return (
    <Scene id="later">
      <section className="st-answer panel">
        {conf.chanceTarget !== null ? (
          <p className="st-big"><span className="fig">{pct(conf.chanceTarget)}</span> <span className="st-unit">chance your income meets your target</span></p>
        ) : (
          <p className="st-big"><span className="fig">{money(conf.income.p10)}</span> <span className="st-unit">a month in a poor case</span></p>
        )}
        <p className="st-sub">From {conf.runs} runs with interest, prices and pay varying. In 9 runs out of 10 your income from {plan.payoutAge} is at least {money(conf.income.p10)} a month.</p>
        <ul className="st-shocks" aria-label="Your income if one thing goes worse">
          {s.cases.map((c) => (
            <li key={c.key}>
              <span>{c.label}</span>
              <span className="st-shock-bar" aria-hidden="true"><span style={{ width: `${Math.min(100, (Math.abs(Math.min(0, c.delta)) / Math.max(1, Math.abs(s.worst.delta))) * 100)}%` }} /></span>
              <b className={`fig ${c.delta < 0 ? 'danger' : 'gain'}`}>{signed(c.delta)}</b>
            </li>
          ))}
        </ul>
        <p className="st-meaning">
          {h.runsOut ? <>MediSave is projected to run out at <b>{h.runsOut}</b>; after that about <b>{money(h.cashToday)}</b> in cash is needed for premiums and bills to 90.</>
            : <>MediSave is projected to cover your premiums and medical bills to 90.</>}
        </p>
      </section>

      <section className="st-levers panel" aria-labelledby="st-levers-h">
        <h2 id="st-levers-h">Try a change</h2>
        <p className="muted small">Nothing is saved until you choose Save this move.</p>
        <div className="st-lever-grid three">
          <Slider id="l-medinf" label="Medical costs rise each year" value={val('medInflation')} min={2} max={8} step={0.5} onChange={(v) => lever('medInflation', v)} format={(v) => `${v}%`} />
          <Slider id="l-ip" label="Integrated Shield, private part a year" value={val('ipPrivate')} min={0} max={3000} step={100} onChange={(v) => lever('ipPrivate', v)} format={money} />
          <Slider id="l-med" label="Medical bills from MediSave a year" value={val('medUsage')} min={0} max={3000} step={100} onChange={(v) => lever('medUsage', v)} format={money} />
        </div>
        <TrialBar {...trial} base={base} plan={plan} />
      </section>

      <ShowHow>
        <table className="st-table">
          <caption className="visually-hidden">Yearly health costs at each age, in today's dollars</caption>
          <thead><tr><th scope="col">Age</th><th scope="col">MediShield Life premium</th><th scope="col">From MediSave</th><th scope="col">In cash</th><th scope="col">MediSave left</th></tr></thead>
          <tbody>{h.points.map((p) => <tr key={p.age}><th scope="row">{p.age}</th><td className="fig">{money(p.msl)}</td><td className="fig">{money(p.fromMa)}</td><td className="fig">{p.cash > 0 ? money(p.cash) : '—'}</td><td className="fig">{money(p.ma)}</td></tr>)}</tbody>
        </table>
        <ul className="st-notes">
          {h.maAt65Today !== null && <li>MediSave at 65: {money(h.maAt65Today)} in today's dollars, {pct(Math.min(1, h.maCoverage))} of the Basic Healthcare Sum.</li>}
          <li>MediShield Life premiums follow MOH's published table by age, before subsidies. MediSave pays MediShield Life and CareShield Life premiums in full, and the private part of an Integrated Shield Plan up to S$300 a year to 40, S$600 from 41 to 70 and S$900 from 71.</li>
          <li>Worse cases: each line re-runs your plan with one thing made worse and shows the change in monthly income from {plan.payoutAge}, in today's dollars.</li>
          <li>The {pct(conf.chanceTarget ?? 0)} chance comes from {conf.runs} runs of the same plan with interest rates, prices and pay drawn at random around the assumptions. It is a guide, not a forecast. CareShield Life and other cover can be set in the planner under Healthcare.</li>
        </ul>
      </ShowHow>
      <SceneNav id="later" onPick={onPick} />
    </Scene>
  );
}

/* ── Chapter 8: Legacy ───────────────────────────────────────────────────── */
export function LegacyChapter({ base, plan, val, lever, trial, onPick }) {
  const s = useMemo(() => legacyScene(plan), [plan]);
  const at = s.at85;
  return (
    <Scene id="legacy">
      <section className="st-answer panel">
        <p className="st-big"><span className="fig">{money(at?.total ?? 0)}</span> <span className="st-unit">left to your family if you live to {at?.age ?? 85}</span></p>
        <p className="st-sub">In today's dollars{s.basic ? '; on the Basic plan, CPF LIFE amounts left are not included' : ''}.</p>
        <ul className="st-legacy" aria-label="What would be left at each age">
          {s.left.map((x) => (
            <li key={x.age}><span className="st-legacy-age">{x.age}</span>
              <span className="st-legacy-bar" aria-hidden="true">
                <span className="seg s2" style={{ width: `${(x.oa / Math.max(1, s.left[0].total)) * 100}%` }} />
                {x.life > 0 && <span className="seg s1" style={{ width: `${(x.life / Math.max(1, s.left[0].total)) * 100}%` }} />}
              </span>
              <b className="fig">{money(x.total)}</b></li>
          ))}
        </ul>
        <p className="st-key-line small"><span className="sw s2" aria-hidden="true" /> Ordinary Account savings <span className="sw s1" aria-hidden="true" /> CPF LIFE premium not yet paid out</p>
        <p className="st-meaning">CPF savings do not pass by your will. They go to the people you nominate with CPF, or are distributed by the Public Trustee if you have not nominated anyone.</p>
      </section>

      <section className="st-levers panel" aria-labelledby="st-levers-h">
        <h2 id="st-levers-h">Try a change</h2>
        <p className="muted small">Nothing is saved until you choose Save this move.</p>
        <div className="st-lever-grid">
          <Slider id="l-keep" label="Keep untouched in your Ordinary Account" value={val('oaKeep')} min={0} max={Math.max(10000, Math.round(s.startToday / 10000) * 10000)} step={5000} onChange={(v) => lever('oaKeep', v)} format={money} />
          <Slider id="l-spread2" label="Spend Ordinary Account savings until age" value={val('oaSpreadTo')} min={Math.min(100, plan.payoutAge + 1)} max={100} step={1} onChange={(v) => lever('oaSpreadTo', v)} format={(v) => `${v}`} />
        </div>
        <TrialBar {...trial} base={base} plan={plan} />
      </section>

      <ShowHow>
        <ul className="st-notes">
          <li>Ordinary Account: {money(s.startToday)} at {s.from}, paid out at {money(s.monthly)} a month to age {s.spreadTo}{s.keep > 0 ? `, keeping ${money(s.keep)} untouched` : ''}, still earning 2.5% interest. What is left is shown in today's dollars.</li>
          <li>CPF LIFE: on Standard and Escalating plans, if you die before payouts add up to the premium (your Retirement Account when payouts start), the rest goes to your nominees. Shown here without interest, in today's dollars.</li>
          <li>Retirement Account savings not used for CPF LIFE, MediSave and any other CPF balances also go to your nominees; they are not shown here.</li>
        </ul>
      </ShowHow>
      <SceneNav id="legacy" onPick={onPick} />
    </Scene>
  );
}
