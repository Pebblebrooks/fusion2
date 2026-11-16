/**
 * Chapter 3, Family. Partner details are facts (saved as typed, as in the planner's Household);
 * a cash top-up for parents is a choice (tried, then saved as a move). Children's education from
 * the Ordinary Account waits for an engine change, so it is described but not yet worked out.
 */
import { useMemo } from 'react';
import { familyScene } from '../model/studio.js';
import { MoneyField, Slider, Choice, money } from '../next/ui.jsx';
import { Scene, GapPill, TrialBar, ShowHow, SceneNav } from './shared.jsx';

export default function FamilyChapter({ base, plan, val, lever, trial, onPick, onFact, now }) {
  const s = useMemo(() => familyScene(plan, now), [plan, now]);
  const a = base.answers;
  return (
    <Scene id="family">
      <section className="st-answer panel">
        {s.hasPartner ? (
          <>
            <p className="st-big"><span className="fig">{money(s.household)}</span> <span className="st-unit">a month for the two of you</span></p>
            <p className="st-sub">In today's dollars, once both of you are paid ({s.yearBoth}): you {money(s.you)}, your partner {money(s.partner)}.</p>
            <GapPill status={s.status} gap={s.gap} above={s.above} />
          </>
        ) : (
          <>
            <p className="st-big"><span className="fig">{money(s.you)}</span> <span className="st-unit">a month for you alone</span></p>
            <p className="st-sub">Add your partner below to plan as a household.</p>
          </>
        )}
        <p className="st-meaning">
          {s.parentTopUp > 0
            ? <>Topping up your parents' CPF with <b>{money(s.parentTopUp)} a year</b> raises their payouts and leaves your own CPF unchanged. It saves you about <b>{money(s.taxSaved)}</b> a year in income tax.</>
            : <>Helping your parents with cash top-ups to their CPF raises their payouts, leaves your own CPF unchanged, and earns you tax relief of up to S$8,000 a year.</>}
        </p>
      </section>

      <section className="panel st-levers" aria-labelledby="st-partner-h">
        <h2 id="st-partner-h">Your partner</h2>
        <p className="muted small">Facts, saved to your plan as you type. With a partner, your income target is treated as the household's.</p>
        <Choice label="Plan with a partner?" name="st-haspartner" value={a.hasPartner} onChange={(v) => onFact({ hasPartner: v })} options={[[false, 'No'], [true, 'Yes']]} />
        {a.hasPartner && (
          <>
            <div className="st-lever-grid">
              <Slider id="st-pby" label="Year born" value={a.pBirthYear} min={1950} max={2008} step={1} onChange={(v) => onFact({ pBirthYear: v })} format={(v) => `${v}`} />
              <Choice label="Sex (CPF LIFE payouts differ)" name="st-psex" value={a.pIsMale} onChange={(v) => onFact({ pIsMale: v })} options={[[false, 'Female'], [true, 'Male']]} />
              <Choice label="Residency" name="st-pstatus" value={a.pStatus} onChange={(v) => onFact({ pStatus: v })} options={[['SC', 'Citizen'], ['PR1', 'PR year 1'], ['PR2', 'PR year 2'], ['PR3', 'PR year 3+']]} />
              <Choice label="Work" name="st-pwork" value={a.pWork} onChange={(v) => onFact({ pWork: v })} options={[['employee', 'Employee'], ['self', 'Self-employed'], ['none', 'Not working']]} />
              {a.pWork === 'employee' && <MoneyField id="st-psal" label="Monthly pay before CPF" value={a.pSalary} onChange={(v) => onFact({ pSalary: v })} />}
              {a.pWork === 'self' && <MoneyField id="st-ptrade" label="Yearly net trade income" value={a.pTradeIncome} onChange={(v) => onFact({ pTradeIncome: v })} />}
            </div>
            <div className="st-lever-grid three">
              <MoneyField id="st-poa" label="Ordinary Account" value={a.pOa} onChange={(v) => onFact({ pOa: v })} />
              <MoneyField id="st-psa" label="Special / Retirement Account" value={a.pSa} onChange={(v) => onFact({ pSa: v })} />
              <MoneyField id="st-pma" label="MediSave Account" value={a.pMa} onChange={(v) => onFact({ pMa: v })} />
            </div>
          </>
        )}
      </section>

      <section className="st-levers panel" aria-labelledby="st-levers-h">
        <h2 id="st-levers-h">Try helping your parents</h2>
        <p className="muted small">Nothing is saved until you choose Save this move.</p>
        <Slider id="l-parent" label="Cash top-up to your parents' CPF each year" value={val('parentTopUpYearly')} min={0} max={Math.max(16000, val('parentTopUpYearly'))} step={500} onChange={(v) => lever('parentTopUpYearly', v)} format={money} />
        {trial.label && val('parentTopUpYearly') !== a.parentTopUpYearly ? (
          <div className="st-trial" role="status">
            <p><b>Trying:</b> {trial.label}. Your own CPF and income do not change; your income tax goes down by about <b className="gain">{money(s.taxSaved)}</b> a year.</p>
            <div className="st-row tight">
              <button type="button" className="btn btn-primary" onClick={trial.onSave}>Save this move</button>
              <button type="button" className="btn btn-ghost" onClick={trial.onReset}>Undo</button>
            </div>
          </div>
        ) : <TrialBar {...trial} base={base} plan={plan} />}
      </section>

      <section className="panel" aria-labelledby="st-kids-h">
        <h2 id="st-kids-h">Children's education</h2>
        <p className="muted">Paying tuition from your Ordinary Account (the CPF Education Loan Scheme) is coming next. It needs a change to the CPF engine so the money comes back to your account, with interest, when your child repays it.</p>
      </section>

      <ShowHow>
        <ul className="st-notes">
          {s.hasPartner && <li>Your partner's income is worked out from their own CPF, the same way as yours: CPF LIFE {money(s.partnerLife)} a month for life from {s.partnerPayoutAge}, plus their Ordinary Account. If one of you dies, that person's CPF LIFE payouts stop.</li>}
          <li>Cash top-ups to the Special or Retirement Account of parents, parents-in-law, grandparents or grandparents-in-law earn tax relief of up to S$8,000 a year, on top of the S$8,000 for your own account. The S$8,000 for loved ones is shared with cash top-ups to their MediSave.</li>
          <li>Relief applies only up to the recipient's current Full Retirement Sum. For a spouse or sibling, relief applies only if their income the year before was S$8,000 or less, or they have a disability.</li>
          <li>Tax saved is an estimate from your pay, after CPF and earned-income relief; your other reliefs are not known here.</li>
          <li>Transfers from your Ordinary Account to your parents' CPF (no tax relief) are not shown yet: they need the same engine change as education.</li>
        </ul>
      </ShowHow>
      <SceneNav id="family" onPick={onPick} />
    </Scene>
  );
}
