import React, { useMemo } from 'react';

const pathOf = (pts) => pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
const niceNum = (v) => (Math.abs(v) >= 1000 ? v.toExponential(1) : Math.abs(v) < 0.01 && v !== 0 ? v.toExponential(1) : String(Number(v.toFixed(3))));

export function Sparkline({ values = [], height = 34, color = 'var(--accent)', fill = true }) {
  if (!values.length) return null;
  const w = 100;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const rng = max - min || 1;
  const pts = values.map((v, i) => ({ x: (i / (values.length - 1 || 1)) * w, y: height - ((v - min) / rng) * (height - 4) - 2 }));
  return (
    <svg className="chart" viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" style={{ height }}>
      {fill && <path d={`${pathOf(pts)} L${w},${height} L0,${height} Z`} fill={color} opacity="0.14" />}
      <path d={pathOf(pts)} fill="none" stroke={color} strokeWidth="1.4" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

export function LossChart({ history = [], height = 190 }) {
  const data = useMemo(() => history.filter((h) => Number.isFinite(h.loss)), [history]);
  if (data.length < 2) return <div className="empty">No training history yet.</div>;
  const W = 340;
  const H = height;
  const pad = { l: 34, r: 10, t: 12, b: 22 };
  const xs = data.map((d) => d.step);
  const losses = data.map((d) => d.loss);
  const vals = data.filter((d) => Number.isFinite(d.valLoss));
  const maxY = Math.max(...losses, ...vals.map((v) => v.valLoss));
  const minY = Math.min(...losses, ...vals.map((v) => v.valLoss));
  const sx = (v) => pad.l + ((v - xs[0]) / ((xs[xs.length - 1] - xs[0]) || 1)) * (W - pad.l - pad.r);
  const sy = (v) => pad.t + (1 - (v - minY) / ((maxY - minY) || 1)) * (H - pad.t - pad.b);
  const train = data.map((d) => ({ x: sx(d.step), y: sy(d.loss) }));
  const val = vals.map((d) => ({ x: sx(d.step), y: sy(d.valLoss) }));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => minY + f * (maxY - minY));
  return (
    <>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} style={{ height }}>
        {ticks.map((t, i) => (
          <g key={i}>
            <line className="grid" x1={pad.l} x2={W - pad.r} y1={sy(t)} y2={sy(t)} />
            <text x={4} y={sy(t) + 3}>{niceNum(t)}</text>
          </g>
        ))}
        <path d={`${pathOf(train)} L${train[train.length - 1].x},${H - pad.b} L${train[0].x},${H - pad.b} Z`} fill="var(--accent)" opacity="0.1" />
        <path d={pathOf(train)} fill="none" stroke="var(--accent)" strokeWidth="1.6" />
        {val.length > 1 && <path d={pathOf(val)} fill="none" stroke="var(--accent-2)" strokeWidth="1.6" strokeDasharray="4 3" />}
        <line className="axis" x1={pad.l} x2={W - pad.r} y1={H - pad.b} y2={H - pad.b} />
        <text x={pad.l} y={H - 7}>step {xs[0]}</text>
        <text x={W - pad.r - 34} y={H - 7}>{xs[xs.length - 1]}</text>
      </svg>
      <div className="legend">
        <span><i style={{ background: 'var(--accent)' }} /> train loss</span>
        <span><i style={{ background: 'var(--accent-2)' }} /> validation</span>
      </div>
    </>
  );
}

export function AttentionHeatmap({ tokens = [], map = [], size = 300 }) {
  const n = Math.min(tokens.length, map.length, 26);
  if (!n) return <div className="empty">No attention data.</div>;
  const cell = Math.max(6, Math.floor((size - 60) / n));
  const W = 60 + n * cell;
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${60 + n * cell}`} style={{ width: '100%' }}>
      {map.slice(0, n).map((row, i) => (
        <g key={i}>
          <text x={56} y={62 + i * cell + cell * 0.7} textAnchor="end" style={{ fontSize: Math.min(9, cell) }}>
            {String(tokens[i] || '').replace(/\n/g, '⏎').replace(/ /g, '␣').slice(0, 8)}
          </text>
          {row.slice(0, n).map((v, j) => (
            <rect
              key={j}
              className="heat-cell"
              x={60 + j * cell}
              y={60 + i * cell}
              width={cell - 0.5}
              height={cell - 0.5}
              fill="var(--accent)"
              opacity={Math.min(1, Math.pow(v, 0.6))}
            />
          ))}
        </g>
      ))}
      {tokens.slice(0, n).map((t, j) => (
        <text key={j} x={60 + j * cell + cell / 2} y={54} textAnchor="start" transform={`rotate(-60 ${60 + j * cell + cell / 2} 54)`} style={{ fontSize: Math.min(9, cell) }}>
          {String(t).replace(/\n/g, '⏎').replace(/ /g, '␣').slice(0, 8)}
        </text>
      ))}
    </svg>
  );
}

export function TokenProbs({ steps = [] }) {
  if (!steps.length) return null;
  return (
    <div className="col" style={{ gap: 8 }}>
      {steps.slice(0, 12).map((s, i) => (
        <div key={i}>
          <div className="spread" style={{ fontSize: 11 }}>
            <code className="token-chip">{String(s.piece).replace(/\n/g, '⏎').replace(/ /g, '␣')}</code>
            <span className="mono muted">p={s.p?.toFixed(3)} · H={s.entropy?.toFixed(2)}</span>
          </div>
          <div className="row" style={{ gap: 3, marginTop: 3 }}>
            {(s.topProbs || []).slice(0, 5).map((t, j) => (
              <div key={j} title={`${t.piece} ${(t.p * 100).toFixed(1)}%`} style={{ flex: t.p + 0.02, height: 6, borderRadius: 3, background: j === 0 ? 'var(--accent)' : 'var(--stroke-2)' }} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function Histogram({ bins = [], mean, ci, height = 150 }) {
  if (!bins.length) return null;
  const W = 320;
  const H = height;
  const pad = { l: 8, r: 8, t: 10, b: 20 };
  const max = Math.max(...bins.map((b) => b.count));
  const bw = (W - pad.l - pad.r) / bins.length;
  const x0 = bins[0].x0;
  const x1 = bins[bins.length - 1].x1;
  const sx = (v) => pad.l + ((v - x0) / ((x1 - x0) || 1)) * (W - pad.l - pad.r);
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} style={{ height }}>
      {bins.map((b, i) => {
        const h = (b.count / max) * (H - pad.t - pad.b);
        return <rect key={i} x={pad.l + i * bw + 0.5} y={H - pad.b - h} width={bw - 1} height={h} fill="var(--accent)" opacity="0.65" rx="1.5" />;
      })}
      {ci && <rect x={sx(ci[0])} y={pad.t} width={Math.max(1, sx(ci[1]) - sx(ci[0]))} height={H - pad.t - pad.b} fill="var(--accent-2)" opacity="0.12" />}
      {Number.isFinite(mean) && <line x1={sx(mean)} x2={sx(mean)} y1={pad.t} y2={H - pad.b} stroke="var(--accent-2)" strokeWidth="1.5" strokeDasharray="3 3" />}
      <line className="axis" x1={pad.l} x2={W - pad.r} y1={H - pad.b} y2={H - pad.b} />
      <text x={pad.l} y={H - 6}>{niceNum(x0)}</text>
      <text x={W - pad.r - 26} y={H - 6}>{niceNum(x1)}</text>
    </svg>
  );
}

export function Scatter({ x = [], y = [], height = 170 }) {
  if (!x.length) return null;
  const W = 320;
  const H = height;
  const pad = 24;
  const xr = [Math.min(...x), Math.max(...x)];
  const yr = [Math.min(...y), Math.max(...y)];
  const sx = (v) => pad + ((v - xr[0]) / ((xr[1] - xr[0]) || 1)) * (W - pad * 1.4);
  const sy = (v) => H - pad + 6 - ((v - yr[0]) / ((yr[1] - yr[0]) || 1)) * (H - pad * 1.6);
  const n = x.length;
  const mx = x.reduce((a, b) => a + b, 0) / n;
  const my = y.reduce((a, b) => a + b, 0) / n;
  let sxy = 0; let sxx = 0;
  for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; }
  const slope = sxy / (sxx || 1);
  const intercept = my - slope * mx;
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} style={{ height }}>
      <line className="axis" x1={pad} x2={W - pad * 0.4} y1={H - pad + 6} y2={H - pad + 6} />
      <line className="axis" x1={pad} x2={pad} y1={10} y2={H - pad + 6} />
      <line x1={sx(xr[0])} y1={sy(intercept + slope * xr[0])} x2={sx(xr[1])} y2={sy(intercept + slope * xr[1])} stroke="var(--accent-2)" strokeWidth="1.4" strokeDasharray="4 3" />
      {x.map((v, i) => <circle key={i} cx={sx(v)} cy={sy(y[i])} r="3" fill="var(--accent)" opacity="0.8" />)}
    </svg>
  );
}

export function LineChart({ points = [], height = 170, color = 'var(--accent)', zeroLine = false }) {
  if (points.length < 2) return null;
  const W = 320;
  const H = height;
  const pad = { l: 30, r: 8, t: 10, b: 18 };
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y).filter(Number.isFinite);
  const xr = [Math.min(...xs), Math.max(...xs)];
  const yr = [Math.min(...ys), Math.max(...ys)];
  const sx = (v) => pad.l + ((v - xr[0]) / ((xr[1] - xr[0]) || 1)) * (W - pad.l - pad.r);
  const sy = (v) => pad.t + (1 - (v - yr[0]) / ((yr[1] - yr[0]) || 1)) * (H - pad.t - pad.b);
  const pts = points.filter((p) => Number.isFinite(p.y)).map((p) => ({ x: sx(p.x), y: sy(p.y) }));
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} style={{ height }}>
      <line className="axis" x1={pad.l} x2={W - pad.r} y1={H - pad.b} y2={H - pad.b} />
      {zeroLine && yr[0] < 0 && yr[1] > 0 && <line className="grid" x1={pad.l} x2={W - pad.r} y1={sy(0)} y2={sy(0)} strokeDasharray="3 3" />}
      <path d={pathOf(pts)} fill="none" stroke={color} strokeWidth="1.6" />
      <text x={2} y={sy(yr[1]) + 4}>{niceNum(yr[1])}</text>
      <text x={2} y={sy(yr[0]) + 4}>{niceNum(yr[0])}</text>
      <text x={pad.l} y={H - 4}>{niceNum(xr[0])}</text>
      <text x={W - pad.r - 24} y={H - 4}>{niceNum(xr[1])}</text>
    </svg>
  );
}

export function PowerCurve({ curve = [], height = 160 }) {
  if (!curve.length) return null;
  return <LineChart points={curve.map((c) => ({ x: c.n, y: c.power }))} height={height} color="var(--accent-3)" />;
}

export function BetaCurve({ alpha = 1, beta = 1, ci, height = 150 }) {
  const pts = [];
  const lgamma = (z) => {
    const g = 7;
    const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
    if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lgamma(1 - z);
    z -= 1;
    let a = c[0];
    const t = z + g + 0.5;
    for (let i = 1; i < g + 2; i++) a += c[i] / (z + i);
    return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(a);
  };
  const lnB = lgamma(alpha) + lgamma(beta) - lgamma(alpha + beta);
  for (let i = 1; i < 200; i++) {
    const x = i / 200;
    pts.push({ x, y: Math.exp((alpha - 1) * Math.log(x) + (beta - 1) * Math.log(1 - x) - lnB) });
  }
  return (
    <>
      <LineChart points={pts} height={height} color="var(--accent-2)" />
      {ci && <div className="small muted mono" style={{ textAlign: 'center' }}>95% CrI [{ci[0].toFixed(3)}, {ci[1].toFixed(3)}]</div>}
    </>
  );
}

export function GraphViz({ nodes = [], edges = [], height = 240 }) {
  if (!nodes.length) return null;
  const R = 95;
  const cx = 160;
  const cy = height / 2;
  const pos = new Map(nodes.map((n, i) => {
    const a = (i / nodes.length) * Math.PI * 2 - Math.PI / 2;
    return [n.node, { x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) }];
  }));
  const maxDeg = Math.max(...nodes.map((n) => n.degree), 1);
  return (
    <svg className="chart" viewBox={`0 0 320 ${height}`} style={{ height }}>
      {edges.map(([a, b], i) => {
        const pa = pos.get(a); const pb = pos.get(b);
        if (!pa || !pb) return null;
        return <line key={i} x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y} stroke="var(--stroke-2)" strokeWidth="1" />;
      })}
      {nodes.map((n) => {
        const p = pos.get(n.node);
        const r = 4 + (n.degree / maxDeg) * 7;
        return (
          <g key={n.node}>
            <circle cx={p.x} cy={p.y} r={r} fill="var(--accent)" opacity="0.85" />
            <text x={p.x} y={p.y - r - 3} textAnchor="middle">{String(n.node).slice(0, 8)}</text>
          </g>
        );
      })}
    </svg>
  );
}

export function PerTokenLoss({ perToken = [], height = 120 }) {
  if (!perToken.length) return null;
  return <LineChart points={perToken.map((v, i) => ({ x: i, y: v }))} height={height} color="var(--warn)" />;
}

/** Dispatcher for skill-produced viz payloads. */
export function Viz({ viz }) {
  if (!viz) return null;
  switch (viz.type) {
    case 'histogram': return <Histogram bins={viz.bins} mean={viz.mean} ci={viz.ci} />;
    case 'scatter': return <Scatter x={viz.x} y={viz.y} />;
    case 'line': return <LineChart points={viz.points} zeroLine />;
    case 'function': return <LineChart points={viz.samples} zeroLine />;
    case 'powerCurve': return <PowerCurve curve={viz.curve} />;
    case 'beta': return <BetaCurve alpha={viz.alpha} beta={viz.beta} ci={viz.ci} />;
    case 'graph': return <GraphViz nodes={viz.nodes} edges={viz.edges} />;
    case 'attention': return <AttentionHeatmap tokens={viz.tokens} map={viz.maps?.[0] || []} />;
    case 'tokenProbs': return <TokenProbs steps={viz.steps} />;
    case 'perTokenLoss': return <PerTokenLoss perToken={viz.perToken} />;
    case 'bootstrap': return <Histogram bins={binify(viz.dist)} mean={viz.estimate} ci={viz.ci} />;
    case 'residuals': return <Scatter x={viz.fitted} y={viz.resid} />;
    case 'meanCompare': return <Histogram bins={binify([...(viz.a || []), ...(viz.b || [])])} ci={viz.ci} />;
    default: return null;
  }
}

function binify(values = [], bins = 18) {
  const v = values.filter(Number.isFinite);
  if (!v.length) return [];
  const min = Math.min(...v);
  const max = Math.max(...v);
  const w = (max - min) / bins || 1;
  const out = Array.from({ length: bins }, (_, i) => ({ x0: min + i * w, x1: min + (i + 1) * w, count: 0 }));
  for (const x of v) out[Math.min(bins - 1, Math.max(0, Math.floor((x - min) / w)))].count++;
  return out;
}
