import { Minus, Plus, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { PRESETS, foodItem, normalizeText, presetItem, type Food, type Preset } from '../lib/foods';
import { fmt1, fmtInt } from '../lib/format';
import { useStore } from '../lib/store';
import type { LogItem } from '../lib/types';
import { MacroChips, NumberField, Segmented } from './ui';

type Tab = 'foods' | 'presets' | 'manual';

export function FoodPicker({ onAdd, initialTab = 'foods' }: { onAdd: (item: LogItem) => void; initialTab?: Tab }) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [q, setQ] = useState('');
  const [food, setFood] = useState<Food | null>(null);
  const [grams, setGrams] = useState<number | undefined>(100);
  const [preset, setPreset] = useState<Preset | null>(null);
  const [qty, setQty] = useState(1);
  const [kcalOverride, setKcalOverride] = useState<number | undefined>(undefined);
  const [manual, setManual] = useState<{ name: string; kcal?: number; p?: number; c?: number; f?: number }>({ name: '' });

  // Tabela embutida + alimentos que o protocolo em vigor acrescentou.
  const { plan } = useStore();
  const nq = normalizeText(q);
  const foods = useMemo(() => Object.values(plan.foods).filter((f) => !nq || normalizeText(f.name).includes(nq)), [nq, plan]);
  const presets = useMemo(() => PRESETS.filter((p) => !nq || normalizeText(p.name).includes(nq)), [nq]);

  const foodPreview = food && grams ? foodItem(food, grams) : null;
  const presetPreview = preset ? presetItem(preset, qty) : null;
  const presetFinal: LogItem | null =
    presetPreview && kcalOverride !== undefined && presetPreview.kcal > 0
      ? (() => {
          const k = kcalOverride / presetPreview.kcal;
          return { ...presetPreview, kcal: kcalOverride, p: fmtNum(presetPreview.p * k), c: fmtNum(presetPreview.c * k), f: fmtNum(presetPreview.f * k) };
        })()
      : presetPreview;

  return (
    <div className="stack">
      <Segmented
        options={[
          { value: 'foods', label: 'Alimentos' },
          { value: 'presets', label: 'Prontos e besteiras' },
          { value: 'manual', label: 'Manual' },
        ]}
        value={tab}
        onChange={(t) => setTab(t)}
      />
      {tab !== 'manual' && (
        <div className="input-suffix">
          <input className="input" placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} />
          <em>
            <Search size={15} />
          </em>
        </div>
      )}

      {tab === 'foods' && (
        <>
          <div className="picker-list">
            {foods.map((f) => (
              <button
                key={f.id}
                type="button"
                className={`picker-item ${food?.id === f.id ? 'on' : ''}`}
                onClick={() => {
                  setFood(f);
                  setGrams(f.unit?.grams ?? 100);
                }}
              >
                <span className="grow" style={{ flex: 1 }}>
                  {f.name}
                  <div className="tiny dim">
                    {fmtInt(f.per100.kcal)} kcal / 100 g · {f.source}
                  </div>
                </span>
              </button>
            ))}
          </div>
          {food && (
            <div className="card" style={{ padding: 12 }}>
              <div className="small" style={{ fontWeight: 700, marginBottom: 8 }}>
                {food.name}
              </div>
              <NumberField label="Quantidade" value={grams} onChange={setGrams} suffix="g" />
              {food.unit && (
                <div className="chips" style={{ marginTop: 8 }}>
                  {[1, 2, 3].map((n) => (
                    <button key={n} className="chip" type="button" onClick={() => setGrams(food.unit!.grams * n)}>
                      {n} {food.unit!.label}
                    </button>
                  ))}
                </div>
              )}
              {foodPreview && (
                <div style={{ marginTop: 10 }}>
                  <MacroChips t={foodPreview} />
                </div>
              )}
              <button className="btn primary block" style={{ marginTop: 12 }} disabled={!foodPreview} onClick={() => foodPreview && onAdd(foodPreview)}>
                <Plus size={16} /> Adicionar
              </button>
            </div>
          )}
        </>
      )}

      {tab === 'presets' && (
        <>
          <div className="hint warn">Valores aproximados de porções típicas. Se souber as calorias reais (rótulo, app do restaurante), ajuste antes de adicionar.</div>
          <div className="picker-list">
            {presets.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`picker-item ${preset?.id === p.id ? 'on' : ''}`}
                onClick={() => {
                  setPreset(p);
                  setQty(1);
                  setKcalOverride(undefined);
                }}
              >
                <span style={{ flex: 1 }}>
                  {p.name}
                  <div className="tiny dim">
                    {p.portion} · {p.category}
                  </div>
                </span>
                <span className="num small">{fmtInt(p.kcal)}</span>
              </button>
            ))}
          </div>
          {preset && presetFinal && (
            <div className="card" style={{ padding: 12 }}>
              <div className="small" style={{ fontWeight: 700 }}>
                {preset.name}
              </div>
              <div className="tiny muted" style={{ marginBottom: 10 }}>
                {preset.portion}
              </div>
              <div className="row between">
                <span className="muted small">Quantidade</span>
                <div className="row">
                  <button className="icon-btn" type="button" onClick={() => {
                      setQty((q0) => Math.max(0.5, q0 - 0.5));
                      setKcalOverride(undefined);
                    }} aria-label="Menos">
                    <Minus size={16} />
                  </button>
                  <span className="num" style={{ minWidth: 34, textAlign: 'center' }}>
                    {fmt1(qty)}
                  </span>
                  <button className="icon-btn" type="button" onClick={() => {
                      setQty((q0) => q0 + 0.5);
                      setKcalOverride(undefined);
                    }} aria-label="Mais">
                    <Plus size={16} />
                  </button>
                </div>
              </div>
              <div style={{ marginTop: 10 }}>
                <NumberField
                  label="Calorias (ajuste se souber o valor real)"
                  value={kcalOverride ?? presetPreview?.kcal}
                  onChange={setKcalOverride}
                  suffix="kcal"
                  decimals={false}
                />
              </div>
              <div style={{ marginTop: 10 }}>
                <MacroChips t={presetFinal} />
              </div>
              <button className="btn primary block" style={{ marginTop: 12 }} onClick={() => onAdd(presetFinal)}>
                <Plus size={16} /> Adicionar
              </button>
            </div>
          )}
        </>
      )}

      {tab === 'manual' && (
        <div className="stack">
          <label className="field">
            <span>O que foi</span>
            <input className="input" value={manual.name} placeholder="Ex.: marmita do restaurante" onChange={(e) => setManual({ ...manual, name: e.target.value })} />
          </label>
          <NumberField label="Calorias" value={manual.kcal} onChange={(v) => setManual({ ...manual, kcal: v })} suffix="kcal" />
          <div className="grid2" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
            <NumberField label="Proteína" value={manual.p} onChange={(v) => setManual({ ...manual, p: v })} suffix="g" />
            <NumberField label="Carbo" value={manual.c} onChange={(v) => setManual({ ...manual, c: v })} suffix="g" />
            <NumberField label="Gordura" value={manual.f} onChange={(v) => setManual({ ...manual, f: v })} suffix="g" />
          </div>
          <div className="tiny muted">Macros são opcionais; as calorias entram no banco de qualquer jeito.</div>
          <button
            className="btn primary block"
            disabled={!manual.kcal || manual.kcal <= 0}
            onClick={() => {
              onAdd({ name: manual.name.trim() || 'Registro manual', kcal: manual.kcal ?? 0, p: manual.p ?? 0, c: manual.c ?? 0, f: manual.f ?? 0 });
              setManual({ name: '' });
            }}
          >
            <Plus size={16} /> Adicionar
          </button>
        </div>
      )}
    </div>
  );
}

function fmtNum(n: number) {
  return Math.round(n * 10) / 10;
}
