// Shared form controls and formatters for the new planner.
export const money = (v) => `S$${Math.round(Number(v) || 0).toLocaleString('en-SG')}`;
export const pct = (v) => `${Math.round(v * 100)}%`;

/* ── Small pieces ─────────────────────────────────────────────────────────── */
export const Help = ({ to, children }) => (
  <a className="help" href={`/learn/#${to}`} target="_blank" rel="noopener">{children}<span aria-hidden="true"> ↗</span></a>
);

export function MoneyField({ label, hint, value, onChange, suffix, id }) {
  return (
    <label className="fld" htmlFor={id}>
      <span className="field-label">{label}</span>
      <span className="input-wrap">
        <span className="prefix" aria-hidden="true">S$</span>
        <input id={id} inputMode="numeric" autoComplete="off" value={value ? Number(value).toLocaleString('en-SG') : ''} placeholder="0"
          onChange={(e) => onChange(Math.min(99999999, Number(e.target.value.replace(/[^\d]/g, '')) || 0))} />
        {suffix && <span className="suffix">{suffix}</span>}
      </span>
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function Choice({ label, value, onChange, options, name }) {
  return (
    <fieldset className="fld choice">
      <legend className="field-label">{label}</legend>
      <div className="seg">
        {options.map(([v, text]) => (
          <label key={String(v)} className={value === v ? 'on' : ''}>
            <input type="radio" name={name} checked={value === v} onChange={() => onChange(v)} />{text}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function Slider({ label, value, min, max, step, onChange, format, id }) {
  return (
    <label className="fld slider" htmlFor={id}>
      <span className="field-label">{label}<output>{format(value)}</output></span>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

