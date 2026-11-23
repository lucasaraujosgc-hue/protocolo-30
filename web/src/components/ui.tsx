import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { addDays, fmtLong } from '../lib/dates';
import { fmt1, fmtInt, numToInput, parseNum } from '../lib/format';
import type { Totals } from '../lib/types';

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg className="brand-mark" width={size} height={size} viewBox="0 0 40 40" aria-hidden>
      <circle cx="20" cy="20" r="16" fill="none" stroke="#ededee" strokeOpacity="0.35" strokeWidth="2.5" />
      <path d="M20 4a16 16 0 0 1 16 16" fill="none" stroke="#ededee" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M9 21h6l3-7 4 13 3-8h6" fill="none" stroke="#ededee" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Ring({
  value,
  max,
  size = 170,
  stroke = 10,
  children,
  color = '#7aa2f7',
}: {
  value: number;
  max: number;
  size?: number;
  stroke?: number;
  children?: ReactNode;
  color?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const frac = max > 0 ? Math.min(1, value / max) : 0;
  const over = value > max * 1.02;
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const t = requestAnimationFrame(() => setShown(frac));
    return () => cancelAnimationFrame(t);
  }, [frac]);
  return (
    <div className="ring-wrap" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={over ? '#e5655e' : color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${c * shown} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          // Com zero, a ponta arredondada desenharia um ponto solto no topo do anel.
          opacity={shown > 0 ? 1 : 0}
          style={{ transition: 'stroke-dasharray 0.8s ease' }}
        />
      </svg>
      <div className="ring-center">{children}</div>
    </div>
  );
}

export function MacroBars({ actual, target, compact }: { actual: Totals; target: { p: number; c: number; f: number }; compact?: boolean }) {
  const rows: { k: 'p' | 'c' | 'f'; name: string }[] = [
    { k: 'p', name: 'Proteína' },
    { k: 'c', name: 'Carbo' },
    { k: 'f', name: 'Gordura' },
  ];
  return (
    <div className="stack tight">
      {rows.map(({ k, name }) => {
        const v = actual[k];
        const t = target[k];
        const pct = t > 0 ? Math.min(100, (v / t) * 100) : 0;
        return (
          <div key={k} className={`macro-row ${compact ? 'compact' : ''}`}>
            <span className="muted">{name}</span>
            <span className="num small">
              {fmtInt(v)}
              <span className="dim">/{fmtInt(t)} g</span>
            </span>
            <div className={`bar ${k} ${v > t * 1.1 ? 'over' : ''}`}>
              <i style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function MacroChips({ t }: { t: Totals }) {
  return (
    <div className="macro-chips">
      <span className="k">{fmtInt(t.kcal)} kcal</span>
      <span className="p">P {fmt1(t.p)}</span>
      <span className="c">C {fmt1(t.c)}</span>
      <span className="f">G {fmt1(t.f)}</span>
    </div>
  );
}

export function Sheet({
  title,
  onClose,
  children,
  full,
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  full?: boolean;
}) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);
  return createPortal(
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className={`sheet ${full ? 'full' : ''}`} role="dialog" aria-modal="true">
        {!full && <div className="sheet-handle" />}
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Fechar">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </>,
    document.body,
  );
}

export function NumberField({
  label,
  value,
  onChange,
  suffix,
  placeholder,
  decimals = true,
}: {
  label?: ReactNode;
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  suffix?: string;
  placeholder?: string;
  decimals?: boolean;
}) {
  const [text, setText] = useState(numToInput(value));
  useEffect(() => {
    const parsed = parseNum(text);
    if (parsed !== value) setText(numToInput(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <label className="field">
      {label && <span>{label}</span>}
      <div className="input-suffix">
        <input
          className="input num"
          inputMode={decimals ? 'decimal' : 'numeric'}
          value={text}
          placeholder={placeholder}
          onChange={(e) => {
            const t = e.target.value.replace(/[^\d.,-]/g, '');
            setText(t);
            onChange(parseNum(t));
          }}
        />
        {suffix && <em>{suffix}</em>}
      </div>
    </label>
  );
}

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: ReactNode }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="seg" role="tablist">
      {options.map((o) => (
        <button key={String(o.value)} className={o.value === value ? 'on' : ''} onClick={() => onChange(o.value)} type="button">
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Switch({ on, onChange, label, hint }: { on: boolean; onChange: (v: boolean) => void; label: ReactNode; hint?: ReactNode }) {
  return (
    <div className="toggle">
      <div>
        <div>{label}</div>
        {hint && <div className="tiny muted">{hint}</div>}
      </div>
      <button type="button" className={`switch ${on ? 'on' : ''}`} onClick={() => onChange(!on)} aria-pressed={on} aria-label={typeof label === 'string' ? label : undefined} />
    </div>
  );
}

export function DateNav({ date, today, onChange, min }: { date: string; today: string; onChange: (d: string) => void; min?: string }) {
  return (
    <div className="date-nav card" style={{ padding: 8 }}>
      <button className="icon-btn" onClick={() => onChange(addDays(date, -1))} disabled={!!min && date <= min} aria-label="Dia anterior">
        <ChevronLeft size={18} />
      </button>
      <div className="when">
        <div style={{ fontWeight: 700 }}>{date === today ? 'Hoje' : fmtLong(date)}</div>
        <div className="tiny muted">{date === today ? fmtLong(date) : date < today ? 'Dia passado' : 'Dia futuro'}</div>
      </div>
      {date !== today ? (
        <button className="btn sm ghost" onClick={() => onChange(today)}>
          Hoje
        </button>
      ) : null}
      <button className="icon-btn" onClick={() => onChange(addDays(date, 1))} aria-label="Próximo dia">
        <ChevronRight size={18} />
      </button>
    </div>
  );
}

export function Delta({ v, unit = 'kcal', invert = false, digits = 0 }: { v: number; unit?: string; invert?: boolean; digits?: number }) {
  const r = digits ? Math.round(v * 10 ** digits) / 10 ** digits : Math.round(v);
  const good = invert ? r < 0 : r > 0;
  const cls = r === 0 ? 'muted' : good ? 'pos' : 'neg';
  const abs = digits ? fmt1(Math.abs(r)) : fmtInt(Math.abs(r));
  return (
    <span className={`num ${cls}`}>
      {r > 0 ? '+' : r < 0 ? '−' : ''}
      {abs}
      {unit ? ` ${unit}` : ''}
    </span>
  );
}
