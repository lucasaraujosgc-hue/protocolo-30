import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { diffDays, fmtShort } from '../lib/dates';
import type { Point } from '../lib/engine';
import { fmt1, fmtInt } from '../lib/format';

export interface Series {
  points: Point[];
  color: string;
  label?: string;
  dashed?: boolean;
  area?: boolean;
  dots?: boolean;
}

function niceTicks(min: number, max: number, count = 4): number[] {
  const span = max - min || 1;
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= count) ?? raw;
  const start = Math.ceil(min / step) * step;
  const out: number[] = [];
  for (let v = start; v <= max + 1e-9; v += step) out.push(Math.round(v * 1000) / 1000);
  return out;
}

export function LineChart({
  series,
  height = 190,
  unit = '',
  digits = 1,
  zero = false,
  band,
}: {
  series: Series[];
  height?: number;
  unit?: string;
  digits?: number;
  zero?: boolean;
  band?: [number, number];
}) {
  const id = useId().replace(/:/g, '');
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(340);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(240, e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);

  const all = series.flatMap((s) => s.points);
  const geo = useMemo(() => {
    if (!all.length) return null;
    const dates = all.map((p) => p.date).sort();
    const d0 = dates[0];
    const d1 = dates[dates.length - 1];
    const spanDays = Math.max(1, diffDays(d1, d0));
    let lo = Math.min(...all.map((p) => p.value));
    let hi = Math.max(...all.map((p) => p.value));
    if (zero) {
      lo = Math.min(lo, 0);
      hi = Math.max(hi, 0);
    }
    if (band) {
      lo = Math.min(lo, band[0]);
      hi = Math.max(hi, band[1]);
    }
    if (hi - lo < 1e-6) {
      hi += 1;
      lo -= 1;
    }
    const pad = (hi - lo) * 0.12;
    lo -= pad;
    hi += pad;
    const L = 40;
    const R = 12;
    const T = 14;
    const B = 24;
    const x = (date: string) => L + (diffDays(date, d0) / spanDays) * (w - L - R);
    const y = (v: number) => T + (1 - (v - lo) / (hi - lo)) * (height - T - B);
    return { d0, d1, x, y, lo, hi, L, R, T, B, ticks: niceTicks(lo, hi) };
  }, [all, w, height, zero, band]);

  if (!geo) {
    return (
      <div ref={ref} className="hint">
        Sem dados ainda. Os registros aparecem aqui com as datas.
      </div>
    );
  }

  const { x, y, L, R, T, B, ticks, d0, d1 } = geo;
  const main = series[0]?.points ?? [];
  const fmtV = (v: number) => (digits ? fmt1(v) : fmtInt(v));
  const pathOf = (pts: Point[]) => pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.date).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const mid = main.length > 2 ? main[Math.floor(main.length / 2)].date : null;

  const onPointer = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!main.length) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * w;
    let best = 0;
    let bd = Infinity;
    main.forEach((p, i) => {
      const d = Math.abs(x(p.date) - px);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    setHover(best);
  };

  const hp = hover !== null ? main[hover] : main[main.length - 1];

  return (
    <div ref={ref}>
      <svg
        className="chart"
        width={w}
        height={height}
        viewBox={`0 0 ${w} ${height}`}
        onPointerDown={onPointer}
        onPointerMove={(e) => e.buttons && onPointer(e)}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={`area${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={series[0]?.color} stopOpacity="0.14" />
            <stop offset="1" stopColor={series[0]?.color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {band && (
          <rect x={L} width={w - L - R} y={y(band[1])} height={Math.max(0, y(band[0]) - y(band[1]))} fill="rgba(76,191,134,0.07)" />
        )}
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={w - R} y1={y(t)} y2={y(t)} stroke="rgba(255,255,255,0.06)" />
            <text x={L - 6} y={y(t) + 3.5} textAnchor="end" fontSize="10" fill="#666a72" fontFamily="Inter">
              {fmtV(t)}
            </text>
          </g>
        ))}
        {zero && <line x1={L} x2={w - R} y1={y(0)} y2={y(0)} stroke="rgba(255,255,255,0.25)" />}
        {series.map((s, si) => (
          <g key={si}>
            {s.area && s.points.length > 1 && (
              <path
                d={`${pathOf(s.points)} L${x(s.points[s.points.length - 1].date)},${height - B} L${x(s.points[0].date)},${height - B} Z`}
                fill={`url(#area${id})`}
              />
            )}
            {s.points.length > 1 && (
              <path
                d={pathOf(s.points)}
                fill="none"
                stroke={s.color}
                strokeWidth={s.dashed ? 1.5 : 2}
                strokeDasharray={s.dashed ? '5 5' : undefined}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            )}
            {(s.dots ?? true) &&
              s.points.length <= 60 &&
              s.points.map((p) => <circle key={p.date} cx={x(p.date)} cy={y(p.value)} r={s.dashed ? 0 : 2.6} fill={s.color} />)}
          </g>
        ))}
        {hp && (
          <g>
            <line x1={x(hp.date)} x2={x(hp.date)} y1={T} y2={height - B} stroke="rgba(255,255,255,0.18)" />
            <circle cx={x(hp.date)} cy={y(hp.value)} r={4.5} fill="#17181b" stroke={series[0]?.color} strokeWidth={2} />
          </g>
        )}
        <text x={L} y={height - 6} fontSize="10" fill="#666a72" fontFamily="Inter">
          {fmtShort(d0)}
        </text>
        {mid && mid !== d0 && mid !== d1 && (
          <text x={x(mid)} y={height - 6} fontSize="10" fill="#666a72" textAnchor="middle" fontFamily="Inter">
            {fmtShort(mid)}
          </text>
        )}
        {d1 !== d0 && (
          <text x={w - R} y={height - 6} fontSize="10" fill="#666a72" textAnchor="end" fontFamily="Inter">
            {fmtShort(d1)}
          </text>
        )}
      </svg>
      {hp && (
        <div className="row between tiny" style={{ marginTop: 2 }}>
          <span className="muted">{fmtShort(hp.date)}</span>
          <span className="num" style={{ color: series[0]?.color }}>
            {fmtV(hp.value)} {unit}
          </span>
        </div>
      )}
    </div>
  );
}
