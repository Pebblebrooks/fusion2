// Savings build-up chart: stacked areas by age, in today's dollars. Hand-drawn SVG, no chart library.
import { useMemo, useRef, useState } from 'react';

const SERIES = [
  { key: 'retire', label: 'Retirement savings (SA / RA)', short: 'Retirement', cls: 's1' },
  { key: 'oa', label: 'Ordinary Account', short: 'Ordinary', cls: 's2' },
  { key: 'ma', label: 'MediSave', short: 'MediSave', cls: 's3' },
];
const W = 720, H = 300, M = { t: 16, r: 96, b: 30, l: 52 };
const money = (v) => `S$${Math.round(v).toLocaleString('en-SG')}`;
const compact = (v) => (v >= 1e6 ? `S$${(v / 1e6).toFixed(1)}m` : v >= 1000 ? `S$${Math.round(v / 1000)}k` : `S$${Math.round(v)}`);
const niceMax = (v) => { const p = Math.pow(10, Math.floor(Math.log10(Math.max(v, 1)))); return Math.ceil(v / p / 0.5) * 0.5 * p; };

export default function SavingsChart({ series, marks = [] }) {
  const [hover, setHover] = useState(null);
  const [table, setTable] = useState(false);
  const ref = useRef(null);
  const g = useMemo(() => {
    // Each point is the balance at the END of that age year, i.e. on the next birthday.
    const pts = series.map((s) => ({ ...s, x: s.age + 1 }));
    if (pts.length < 2) return null;
    const x0 = pts[0].x, x1 = pts[pts.length - 1].x;
    const max = niceMax(Math.max(...pts.map((p) => p.retire + p.oa + p.ma)));
    const sx = (x) => M.l + ((x - x0) / Math.max(1, x1 - x0)) * (W - M.l - M.r);
    const sy = (v) => M.t + (1 - v / max) * (H - M.t - M.b);
    let base = pts.map(() => 0);
    const layers = SERIES.map((s) => {
      const top = pts.map((p, i) => base[i] + p[s.key]);
      const d = `M${pts.map((p, i) => `${sx(p.x).toFixed(1)},${sy(top[i]).toFixed(1)}`).join('L')}L${[...pts].reverse().map((p, i) => `${sx(p.x).toFixed(1)},${sy(base[pts.length - 1 - i]).toFixed(1)}`).join('L')}Z`;
      const mid = (top[top.length - 1] + base[base.length - 1]) / 2, thick = top[top.length - 1] - base[base.length - 1];
      base = top;
      return { ...s, d, labelY: sy(mid), show: thick / max > 0.06 };
    });
    const ticksY = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
    const step = x1 - x0 > 24 ? 10 : 5;
    const ticksX = []; for (let a = Math.ceil(x0 / step) * step; a <= x1; a += step) ticksX.push(a);
    return { pts, x0, x1, max, sx, sy, layers, ticksY, ticksX };
  }, [series]);
  if (!g) return null;

  const onMove = (e) => {
    const box = ref.current.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * W;
    const age = Math.round(g.x0 + ((px - M.l) / (W - M.l - M.r)) * (g.x1 - g.x0));
    const i = Math.min(g.pts.length - 1, Math.max(0, age - g.x0));
    setHover(i);
  };
  const hp = hover === null ? null : g.pts[hover];
  const every = g.pts.filter((p, i) => p.x % 5 === 0 || i === g.pts.length - 1);

  return (
    <figure className="chart">
      <div className="chart-legend" aria-hidden="true">
        {SERIES.map((s) => <span key={s.key}><i className={`sw ${s.cls}`} />{s.label}</span>)}
      </div>
      {table ? (
        <div className="table-scroll">
          <table className="data">
            <thead><tr><th scope="col">Age</th>{SERIES.map((s) => <th key={s.key} scope="col">{s.short}</th>)}<th scope="col">Total</th></tr></thead>
            <tbody>{every.map((p) => (
              <tr key={p.x}><th scope="row">{p.x}</th>{SERIES.map((s) => <td key={s.key}>{money(p[s.key])}</td>)}<td>{money(p.retire + p.oa + p.ma)}</td></tr>
            ))}</tbody>
          </table>
        </div>
      ) : (
        <div className="chart-plot">
          <svg ref={ref} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="CPF savings by age, in today's dollars. Use Show as table for the figures."
            onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
            {g.ticksY.map((v) => (
              <g key={v}><line className="grid" x1={M.l} x2={W - M.r} y1={g.sy(v)} y2={g.sy(v)} /><text className="tick" x={M.l - 8} y={g.sy(v) + 4} textAnchor="end">{compact(v)}</text></g>
            ))}
            {g.ticksX.map((a) => <text key={a} className="tick" x={g.sx(a)} y={H - 8} textAnchor="middle">{a}</text>)}
            {g.layers.map((l) => <path key={l.key} className={`area ${l.cls}`} d={l.d} />)}
            {marks.filter((m) => m.age > g.x0 && m.age <= g.x1).map((m) => (
              <g key={m.age}><line className="mark" x1={g.sx(m.age)} x2={g.sx(m.age)} y1={M.t} y2={H - M.b} />
                <text className="mark-label" x={g.sx(m.age) - 6} y={M.t + 12} textAnchor="end">{m.label}</text></g>
            ))}
            {g.layers.filter((l) => l.show).map((l) => <text key={l.key} className="direct" x={W - M.r + 8} y={l.labelY + 4}>{l.short}</text>)}
            {hp && <line className="cross" x1={g.sx(hp.x)} x2={g.sx(hp.x)} y1={M.t} y2={H - M.b} />}
          </svg>
          {hp && (
            <div className="tip" style={{ left: `${(g.sx(hp.x) / W) * 100}%` }} data-flip={g.sx(hp.x) > W * 0.6 ? 'y' : 'n'}>
              <strong>Age {hp.x}</strong>
              {[...SERIES].reverse().map((s) => <span key={s.key}><i className={`sw ${s.cls}`} />{s.short}<b>{money(hp[s.key])}</b></span>)}
              <span className="tip-total">Total<b>{money(hp.retire + hp.oa + hp.ma)}</b></span>
            </div>
          )}
        </div>
      )}
      <figcaption>
        Today&rsquo;s dollars, at each birthday.{' '}
        <button type="button" className="link" onClick={() => setTable((v) => !v)}>{table ? 'Show as chart' : 'Show as table'}</button>
      </figcaption>
    </figure>
  );
}
