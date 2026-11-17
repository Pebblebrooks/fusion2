/**
 * Chapter 3, Family. Partner details are facts (saved as typed, as in the planner's Household).
 * Tuition from the Ordinary Account, CPF transfers to loved ones and cash top-ups for parents are
 * choices: tried, then saved as moves. The engine applies CPF's limits (src/engine/family.js).
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
        <h2 id="st-levers-h">Try a change</h2>
        <p className="muted small">Nothing is saved until you choose Save this move.</p>

        <h3 className="st-sub-h">Children's education from your Ordinary Account</h3>
        <div className="st-lever-grid">
          <Slider id="l-edu" label="Tuition a year, today's dollars" value={val('eduYearly')} min={0} max={Math.max(30000, val('eduYearly'))} step={1000} onChange={(v) => lever('eduYearly', v)} format={money} />
          {val('eduYearly') > 0 && <>
            <Slider id="l-edustart" label="Fees start when you are" value={val('eduStartAge') || plan.age + 1} min={plan.age} max={75} step={1} onChange={(v) => lever('eduStartAge', v)} format={(v) => `${v}`} />
            <Slider id="l-eduyears" label="Years of study" value={val('eduYears')} min={1} max={6} step={1} onChange={(v) => lever('eduYears', v)} format={(v) => `${v}`} />
            <Slider id="l-edurepay" label="Your child repays over" value={val('eduRepayYears')} min={1} max={12} step={1} onChange={(v) => lever('eduRepayYears', v)} format={(v) => `${v} years`} />
          </>}
        </div>
        {s.edu && <p className="small muted">{money(s.edu.paid)} paid from {s.edu.from}{s.edu.short > 0 ? ` (${money(s.edu.short)} less than asked: CPF limits it to 40% of your Ordinary Account savings${s.edu.from >= 55 ? ', after the Full Retirement Sum is set aside' : ''})` : ''}; {money(s.edu.repaid)} comes back with interest{s.edu.repayFrom ? `, from ${s.edu.repayFrom} to ${s.edu.repayTo}` : ''}. In the dollars of each year.</p>}

        <h3 className="st-sub-h">CPF transfer to a loved one</h3>
        <div className="st-lever-grid">
          <Slider id="l-give" label="From your Ordinary Account each year" value={val('lovedTransferYearly')} min={0} max={Math.max(20000, val('lovedTransferYearly'))} step={500} onChange={(v) => lever('lovedTransferYearly', v)} format={money} />
          {val('lovedTransferYearly') > 0 && <>
            <Choice label="To" name="l-rel" value={val('lovedRelation')} onChange={(v) => lever('lovedRelation', v)} options={[['parent', 'Parents or grandparents'], ['spouse', 'Spouse'], ['other', 'Sibling or in-law']]} />
            <Slider id="l-givefrom" label="Starting when you are" value={val('lovedFromAge') || plan.age} min={plan.age} max={80} step={1} onChange={(v) => lever('lovedFromAge', v)} format={(v) => `${v}`} />
            <Slider id="l-giveyears" label="For how many years" value={val('lovedYears')} min={1} max={20} step={1} onChange={(v) => lever('lovedYears', v)} format={(v) => `${v}`} />
          </>}
        </div>
        {s.loved && <p className="small muted">{money(s.loved.sent)} transferred in all{s.loved.short > 0 ? `; ${money(s.loved.short)} less than asked, because CPF keeps back your ${s.loved.relation === 'spouse' ? 'Basic' : 'Full'} Retirement Sum first` : ''}. CPF transfers get no tax relief.</p>}

        <h3 className="st-sub-h">Dependants' Protection Scheme</h3>
        <Choice label="Life cover for your family, paid from CPF until 65" name="l-dps" value={val('dpsCover')} onChange={(v) => lever('dpsCover', v)} options={[[true, 'Keep it'], [false, 'Opt out']]} />

        <h3 className="st-sub-h">Cash top-up to your parents' CPF</h3>
        <Slider id="l-parent" label="Each year, in cash" value={val('parentTopUpYearly')} min={0} max={Math.max(16000, val('parentTopUpYearly'))} step={500} onChange={(v) => lever('parentTopUpYearly', v)} format={money} />
        {s.parentTopUp > 0 && <p className="small muted">Your own CPF does not change; you save about {money(s.taxSaved)} a year in income tax.</p>}

        <TrialBar {...trial} base={base} plan={plan} />
      </section>

      <ShowHow>
        <ul className="st-notes">
          {s.hasPartner && <li>Your partner's income is worked out from their own CPF, the same way as yours: CPF LIFE {money(s.partnerLife)} a month for life from {s.partnerPayoutAge}, plus their Ordinary Account. If one of you dies, that person's CPF LIFE payouts stop.</li>}
          <li>Cash top-ups to the Special or Retirement Account of parents, parents-in-law, grandparents or grandparents-in-law earn tax relief of up to S$8,000 a year, on top of the S$8,000 for your own account. The S$8,000 for loved ones is shared with cash top-ups to their MediSave.</li>
          <li>Relief applies only up to the recipient's current Full Retirement Sum. For a spouse or sibling, relief applies only if their income the year before was S$8,000 or less, or they have a disability.</li>
          <li>Dependants' Protection Scheme: S$70,000 of life cover to 60, then S$55,000 to 65, from S$18 a year (34 and below) to S$298 (55 to 64), paid from your Ordinary Account.</li>
          <li>Tax saved is an estimate from your pay, after CPF and earned-income relief; your other reliefs are not known here.</li>
          <li>CPF Education Loan Scheme: tuition for full-time subsidised courses can be paid from your Ordinary Account, up to 40% of your accumulated Ordinary Account savings less what is already used; from 55, only after the Full Retirement Sum is set aside. Your child repays it, with the interest it would have earned (2.5% a year), into your Ordinary Account over up to 12 years, usually from a year after the course ends.</li>
          <li>Repayments that arrive after {plan.payoutAge} add to your Ordinary Account but are not counted in your monthly income here.</li>
          <li>CPF transfers to loved ones: you first keep back the current Full Retirement Sum (parents or grandparents; or the Basic Retirement Sum if you own a property that covers the rest), the Basic Retirement Sum for a spouse, or the Full Retirement Sum for siblings and in-laws. Below 55 only Ordinary Account savings can go; from 55, Ordinary Account first, then Retirement Account. The loved one's own CPF is not shown.</li>
        </ul>
      </ShowHow>
      <SceneNav id="family" onPick={onPick} />
    </Scene>
  );
}
