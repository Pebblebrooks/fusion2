/**
 * Chapters 2 (Building), 5 (Turning 55) and 6 (Payout). Each follows the scene rules: one question,
 * one large answer with a sentence of meaning, at most one chart, up to three levers, the working
 * behind "Show how". Levers are tried first and only kept when the user saves the move.
 * Figures come from src/model/studio.js.
 */
import { useMemo } from 'react';
import { buildingScene, turning55Scene, payoutScene } from '../model/studio.js';
import { RETIREMENT_SUMS_2026, RETIREMENT_SUMS_2027 } from '../policy/cpf2026.js';
import { Slider, Choice, money, pct } from '../next/ui.jsx';
import SavingsChart from '../next/Chart.jsx';
import { IncomeBar } from '../next/Modules.jsx';
import { Scene, GapPill, TrialBar, ShowHow, SceneNav } from './shared.jsx';

const rate = (v) => `${Math.round(v * 1000) / 10}%`;

/* ── Chapter 2: Building ─────────────────────────────────────────────────── */
export function BuildingChapter({ base, plan, val, lever, trial, onPick }) {
  const s = useMemo(() => buildingScene(plan), [plan]);
  const a = plan.answers;
  const working = a.work !== 'none';
  return (
    <Scene id="building">
      <section className="st-answer panel">
        {s.done ? (
          <p className="st-big"><span className="fig">{money(s.totalNow)}</span> <span className="st-unit">in CPF today</span></p>
        ) : (
          <>
            <p className="st-big"><span className="fig">{money(s.totalAt)}</span> <span className="st-unit">at {s.until}, in today's dollars</span></p>
            <p className="st-sub">From {money(s.totalNow)} today{s.multiple ? `: about ${s.multiple.toFixed(1)} times as much` : ''}.</p>
          </>
        )}
        {s.series.length > 1 && <SavingsChart series={s.series} marks={[]} />}
        <p className="st-meaning">
          {s.done ? `You have reached ${s.until}; from here your savings turn into income. See Payout.`
            : s.until === 55 ? <>At 55 part of this forms your Retirement Account, which pays your CPF LIFE income. <b>Turning 55</b> shows how much.</>
              : <>These savings are what CPF LIFE and your Ordinary Account income are paid from at {s.until}.</>}
        </p>
      </section>

      {!s.done && (
        <section className="st-levers panel" aria-labelledby="st-levers-h">
          <h2 id="st-levers-h">Try a change</h2>
          <p className="muted small">Nothing is saved until you choose Save this move.</p>
          {working ? (
            <div className="st-lever-grid">
              {a.work === 'employee' && <Slider id="l-paygrowth" label="Pay rise each year, above prices" value={val('realPayGrowth')} min={-2} max={5} step={0.5} onChange={(v) => lever('realPayGrowth', v)} format={(v) => `${v}%`} />}
              <Slider id="l-stop" label="Age you stop working" value={val('stopWorkAge')} min={Math.max(plan.age, 40)} max={75} step={1} onChange={(v) => lever('stopWorkAge', v)} format={(v) => `${v}`} />
              <Slider id="l-vc3a" label="Extra to all three accounts each year" value={val('vc3aYearly')} min={0} max={Math.max(20000, val('vc3aYearly'))} step={500} onChange={(v) => lever('vc3aYearly', v)} format={money} />
            </div>
          ) : <p className="muted">Your plan says you are not working, so there is nothing to change here. Cash top-ups are in <b>Turning 55</b>.</p>}
          <TrialBar {...trial} base={base} plan={plan} />
        </section>
      )}

      <ShowHow>
        {s.milestones.length > 0 && (
          <table className="st-table">
            <caption className="visually-hidden">Your CPF on each birthday, in today's dollars</caption>
            <thead><tr><th scope="col">On your birthday at</th><th scope="col">Ordinary</th><th scope="col">{s.until > 55 ? 'Retirement' : 'Special'}</th><th scope="col">MediSave</th><th scope="col">Total</th></tr></thead>
            <tbody>{s.milestones.map((m) => <tr key={m.age}><th scope="row">{m.age}</th><td className="fig">{money(m.oa)}</td><td className="fig">{money(m.retire)}</td><td className="fig">{money(m.ma)}</td><td className="fig">{money(m.total)}</td></tr>)}</tbody>
          </table>
        )}
        <ul className="st-notes">
          {!s.done && <li>From now to {s.until}, in the dollars of each year: money in {money(s.moneyIn)} (contributions, top-ups and grants), interest {money(s.interest)}, money out {money(s.out)} (home loan, healthcare and other withdrawals). Your CPF on your {s.until}th birthday: {money(s.endNominal)}, which is {money(s.totalAt)} in today's dollars.</li>}
          <li>Interest: {rate(plan.assumptions.oa)} a year on the Ordinary Account and {rate(plan.assumptions.sma)} on the Special, MediSave and Retirement Accounts, plus the extra interest on the first S$60,000.</li>
          <li>Prices are assumed to rise {rate(plan.assumptions.inflation)} a year. {working ? `You stop contributing at ${s.stopWorkAge}.` : ''}</li>
          <li>Extra to all three accounts (voluntary contributions): split like your own contributions. Together with mandatory contributions it cannot pass the CPF annual limit of S$37,740; anything above is left out. No tax relief.</li>
        </ul>
      </ShowHow>
      <SceneNav id="building" onPick={onPick} />
    </Scene>
  );
}

/* ── Chapter 5: Turning 55 ───────────────────────────────────────────────── */
/** Retirement Account against the Basic, Full and Enhanced Retirement Sums. */
function SumsMeter({ ra, sums }) {
  const max = Math.max(sums.ERS, ra) * 1.04;
  const at = (v) => `${Math.min(100, (v / max) * 100)}%`;
  return (
    <div className="st-meter" role="img" aria-label={`Retirement Account ${money(ra)}; Basic ${money(sums.BRS)}, Full ${money(sums.FRS)}, Enhanced ${money(sums.ERS)} Retirement Sum`}>
      <div className="st-meter-track"><span className="st-meter-fill" style={{ width: at(ra) }} /></div>
      {[['BRS', 'Basic'], ['FRS', 'Full'], ['ERS', 'Enhanced']].map(([k, name]) => (
        <span key={k} className="st-meter-mark" style={{ left: at(sums[k]) }}><span className="st-meter-tick" /><span className="st-meter-label">{name}<b>{money(sums[k])}</b></span></span>
      ))}
    </div>
  );
}

export function Turning55Chapter({ base, plan, val, lever, trial, onPick }) {
  const s = useMemo(() => turning55Scene(plan), [plan]);
  const g = plan.assumptions.sumGrowth;
  return (
    <Scene id="turning55">
      <section className="st-answer panel">
        {s.done ? (
          <>
            <p className="st-big"><span className="fig">{money(s.ra)}</span> <span className="st-unit">in your Retirement Account</span></p>
            <p className="st-sub">You turned 55 in {s.year55}. Retirement sums shown are for {s.year}.</p>
          </>
        ) : (
          <>
            <p className="st-big"><span className="fig">{pct(Math.min(1, s.coverage))}</span> <span className="st-unit">of the Full Retirement Sum at 55</span></p>
            <p className="st-sub">In {s.year55}, {s.yearsTo === 1 ? 'next year' : `${s.yearsTo} years from now`}. Amounts below are in {s.year55} dollars.</p>
          </>
        )}
        <SumsMeter ra={s.ra} sums={s.sums} />
        <p className="st-meaning">
          {s.done
            ? (s.aboveErs
              ? <>That is above the Enhanced Retirement Sum ({money(s.sums.ERS)} in {s.year}), so cash top-ups are not accepted. Interest still adds to it.</>
              : <>You can add up to <b>{money(s.room)}</b> more in cash, up to the Enhanced Retirement Sum ({money(s.sums.ERS)} in {s.year}). More in the account means higher CPF LIFE payouts.</>)
            : s.metFrs
              ? <>Your Retirement Account starts with about <b>{money(s.ra)}</b>, the full amount.{s.takeOut > 0 && <> The other <b>{money(s.takeOut)}</b> stays in your Ordinary Account: you can take it out from 55, or leave it there earning interest.</>}</>
              : <>Your Retirement Account starts with about <b>{money(s.ra)}</b>, short of the {money(s.sums.FRS)} Full Retirement Sum. You can take out up to <b>{money(s.takeOut)}</b> from 55.</>}
        </p>
      </section>

      <section className="st-levers panel" aria-labelledby="st-levers-h">
        <h2 id="st-levers-h">Try a change</h2>
        <p className="muted small">Nothing is saved until you choose Save this move.</p>
        {s.done && base.answers.topUpYearly === 0 && turning55Scene(base).aboveErs ? (
          <p className="muted">Your Retirement Account is above the Enhanced Retirement Sum, so there is nothing to top up. Payout shows what it pays.</p>
        ) : (
          <div className="st-lever-grid">
            <Slider id="l-topup" label={`Cash top-up to your ${plan.age < 55 ? 'Special' : 'Retirement'} Account each year`} value={val('topUpYearly')} min={0} max={Math.max(16000, val('topUpYearly'))} step={500} onChange={(v) => lever('topUpYearly', v)} format={money} />
            {plan.age < 55 && <Slider id="l-oasa" label="Move from Ordinary to Special Account each year" value={val('oaToSaYearly')} min={0} max={Math.max(20000, val('oaToSaYearly'))} step={500} onChange={(v) => lever('oaToSaYearly', v)} format={money} />}
          </div>
        )}
        {!s.done && (
          <>
            <h3 className="st-sub-h">Taking money out at 55</h3>
            <div className="st-lever-grid">
              <Slider id="l-w55" label="Take out at 55, in today's dollars" value={val('withdrawAt55')} min={0} max={Math.max(100000, val('withdrawAt55'))} step={1000} onChange={(v) => lever('withdrawAt55', v)} format={money} />
              {base.answers.ownsHome && <Choice label="Pledge your home?" name="l-pledge" value={val('pledge')} onChange={(v) => lever('pledge', v)} options={[[false, 'No'], [true, 'Yes']]} />}
            </div>
            {s.withdrawn > 0 && <p className="small muted">CPF lets you take out {money(s.withdrawn)} in all{s.pledge ? ', with your home pledged' : ''}, in the dollars of those years. Less stays for CPF LIFE.</p>}
          </>
        )}
        <TrialBar {...trial} base={base} plan={plan} />
      </section>

      <ShowHow>
        <table className="st-table">
          <caption className="visually-hidden">Retirement sums for {s.done ? s.year : s.year55}</caption>
          <thead><tr><th scope="col">Retirement sum in {s.done ? s.year : s.year55}</th><th scope="col">Amount</th></tr></thead>
          <tbody>
            <tr><th scope="row">Basic (BRS)</th><td className="fig">{money(s.sums.BRS)}</td></tr>
            <tr><th scope="row">Full (FRS)</th><td className="fig">{money(s.sums.FRS)}</td></tr>
            <tr><th scope="row">Enhanced (ERS)</th><td className="fig">{money(s.sums.ERS)}</td></tr>
          </tbody>
        </table>
        <ul className="st-notes">
          <li>At 55 a Retirement Account is opened. Special Account savings go in first, then Ordinary Account savings, up to the Full Retirement Sum. Since 2025 the Special Account then closes; what is left in it moves to the Ordinary Account.</li>
          <li>From 55 you can take out savings above the Full Retirement Sum, or up to S$5,000 if you have less. With a property pledge you can take out savings above the Basic Retirement Sum; that option is not shown here.</li>
          <li>Official sums: 2026 BRS {money(RETIREMENT_SUMS_2026.BRS)}, FRS {money(RETIREMENT_SUMS_2026.FRS)}, ERS {money(RETIREMENT_SUMS_2026.ERS)}; 2027 FRS {money(RETIREMENT_SUMS_2027.FRS)}. Later years are assumed to rise {rate(g)} a year.</li>
          <li>Cash top-ups are accepted up to the Full Retirement Sum before 55 and up to the Enhanced Retirement Sum after 55. Tax relief applies to up to S$8,000 a year for top-ups to your own account.</li>
          <li>Property pledge: if you own a property with enough lease, you can pledge it at 55 so only the Basic Retirement Sum goes into your Retirement Account. The rest stays in your Ordinary Account, where "Take out at 55" can withdraw it. CPF LIFE payouts are then lower. If you sell the home later, the pledged amount must be restored.</li>
        </ul>
      </ShowHow>
      <SceneNav id="turning55" onPick={onPick} />
    </Scene>
  );
}

/* ── Chapter 6: Payout ───────────────────────────────────────────────────── */
export function PayoutChapter({ base, plan, val, lever, trial, onPick }) {
  const s = useMemo(() => payoutScene(plan), [plan]);
  const minAge = Math.min(70, Math.max(65, plan.age));
  return (
    <Scene id="payout">
      <section className="st-answer panel">
        <p className="st-big"><span className="fig">{money(s.income)}</span> <span className="st-unit">a month from {s.payoutAge}</span></p>
        <p className="st-sub">In today's dollars. Payouts start in {s.yearPayout}.</p>
        <IncomeBar p={plan} />
        <p className="st-meaning">
          CPF LIFE ({s.planName} plan) pays <b>{money(s.life)} a month for life</b>.
          {s.oa > 0 && <> Your Ordinary Account adds {money(s.oa)} a month until age {s.spreadTo}, then stops.</>}
          {s.other > 0 && <> Your home sale adds {money(s.other)} a month.</>}
        </p>
        <GapPill status={s.status} gap={s.gap} above={s.above} />
      </section>

      <section className="st-levers panel" aria-labelledby="st-levers-h">
        <h2 id="st-levers-h">Try a change</h2>
        <p className="muted small">Nothing is saved until you choose Save this move.</p>
        <div className="st-lever-grid">
          <Slider id="l-payage" label="Age CPF LIFE starts" value={val('payoutAge')} min={minAge} max={70} step={1} onChange={(v) => lever('payoutAge', v)} format={(v) => `${v}`} />
          <Slider id="l-spread" label="Spend Ordinary Account savings until age" value={val('oaSpreadTo')} min={Math.min(100, s.payoutAge + 1)} max={100} step={1} onChange={(v) => lever('oaSpreadTo', v)} format={(v) => `${v}`} />
        </div>
        <Choice label="CPF LIFE plan" name="l-plan" value={val('lifePlan')} onChange={(v) => lever('lifePlan', v)}
          options={[['std', 'Standard'], ['esc', 'Escalating'], ['bas', 'Basic']]} />
        <TrialBar {...trial} base={base} plan={plan} />
      </section>

      <ShowHow>
        <table className="st-table">
          <caption className="visually-hidden">First monthly CPF LIFE payout for each plan</caption>
          <thead><tr><th scope="col">CPF LIFE plan</th><th scope="col">First payout, {s.yearPayout}</th><th scope="col">In today's dollars</th></tr></thead>
          <tbody>{s.plans.map((p) => <tr key={p.key} className={p.key === s.lifePlan ? 'st-on' : ''}><th scope="row">{p.name}{p.key === s.lifePlan ? ' (yours)' : ''}</th><td className="fig">{money(p.nominal)}</td><td className="fig">{money(p.today)}</td></tr>)}</tbody>
        </table>
        <ul className="st-notes">
          <li>Retirement Account when payouts start: {money(s.raAtPayout)}. Payouts are read from the CPF LIFE estimator tables for 2026 for that balance, age and sex.</li>
          <li>Standard: level payouts for life. Escalating: starts lower and rises 2% a year. Basic: a smaller part goes into the CPF LIFE pool, so payouts are lower and can fall once the Retirement Account runs down, usually around 90.</li>
          <li>Starting later, up to 70, raises payouts for every year you wait.</li>
          <li>Ordinary Account income is your Ordinary Account at {s.payoutAge} paid out evenly to age {s.spreadTo}, still earning interest. It is not for life, so it is shown apart from CPF LIFE.</li>
        </ul>
      </ShowHow>
      <SceneNav id="payout" onPick={onPick} />
    </Scene>
  );
}
