import { ChevronDown, Plus, Ruler } from 'lucide-react';
import { lazy, Suspense, useMemo, useState } from 'react';
import { LineChart } from '../components/LineChart';
import { MeasureSheet } from '../components/MeasureSheet';
import { Delta, Switch } from '../components/ui';
import { buildSnapshots, RING_KEYS, RING_META, type RingKey } from '../lib/body';
import type { BodyView } from '../components/Body3D';
import { diffDays, fmtLong, fmtShort } from '../lib/dates';
import {
  adaptiveTdee,
  composition,
  emaTrend,
  fastingWeights,
  intervalCriteria,
  latestValues,
  linearSlope,
  review,
  seriesOf,
  sortedMeasurements,
} from '../lib/engine';
import { fmt1, fmtInt } from '../lib/format';
import { MEASURE_META, MEASURES } from '../lib/measures';
import { editFrom } from '../lib/protocol';
import { nextHardDay } from '../lib/schedule';
import { useStore } from '../lib/store';
import type { Measurement, MeasureKey } from '../lib/types';

const Body3D = lazy(() => import('../components/Body3D'));
const ACCENT = '#7aa2f7';

export function Progress() {
  const { state, today, nowMin, samples, bank, protocol, saveProtocols } = useStore();
  const [sheet, setSheet] = useState<{ m?: Measurement } | null>(null);
  const [metric, setMetric] = useState<MeasureKey | 'bf'>('weight');
  const [snapIdx, setSnapIdx] = useState<number | null>(null);
  const [compare, setCompare] = useState(true);
  const [view, setView] = useState<BodyView>('front');
  const [hl, setHl] = useState<RingKey | null>('waistNavel');
  const [guide, setGuide] = useState(false);

  const ms = state.measurements;
  const profile = state.profile;
  const snaps = useMemo(() => buildSnapshots(ms, profile), [ms, profile]);
  const idx = snapIdx === null ? snaps.length - 1 : Math.min(snapIdx, snaps.length - 1);
  const snap = snaps[idx];
  const base = snaps[0];

  const weights = useMemo(() => fastingWeights(ms), [ms]);
  const trend = useMemo(() => emaTrend(weights), [weights]);
  const lv = useMemo(() => latestValues(ms), [ms]);
  const comp = useMemo(() => composition(lv, profile), [lv, profile]);
  const opts = { today, nowMin, samples };
  const rev = useMemo(() => review(state, opts, bank), [state, today, bank]); // eslint-disable-line react-hooks/exhaustive-deps
  const tdee = useMemo(() => adaptiveTdee(state, opts, bank), [state, today, bank]); // eslint-disable-line react-hooks/exhaustive-deps
  const crit = useMemo(() => intervalCriteria(state), [state]);

  const recent = weights.filter((p) => diffDays(today, p.date) <= 14);
  const slope = linearSlope(recent.map((p) => ({ x: diffDays(p.date, today), y: p.value })));
  const rateWeek = slope !== null && recent.length >= 4 ? -slope * 7 : null;
  const first = weights[0];
  const last = weights[weights.length - 1];

  const bfSeries = useMemo(() => {
    if (!profile) return [];
    const out: { date: string; value: number }[] = [];
    const dates = [...new Set(sortedMeasurements(ms).map((m) => m.date))];
    for (const d of dates) {
      const c = composition(latestValues(ms, d), profile);
      const bf = c.navy !== undefined && c.rfm !== undefined ? (c.navy + c.rfm) / 2 : (c.navy ?? c.rfm);
      if (bf !== undefined && ms.some((m) => m.date === d && (m.waistNavel || m.neck))) out.push({ date: d, value: bf });
    }
    return out;
  }, [ms, profile]);

  const available = MEASURES.filter((m) => seriesOf(ms, m.key).length > 0);
  const chartSeries =
    metric === 'bf'
      ? [{ points: bfSeries, color: ACCENT, area: true }]
      : metric === 'weight'
        ? [
            { points: seriesOf(ms, 'weight'), color: ACCENT, area: true },
            { points: trend, color: '#9a9ea6', dashed: true, dots: false },
          ]
        : [{ points: seriesOf(ms, metric), color: ACCENT, area: true }];

  const ringValue = (k: RingKey, s = snap) => (s ? s.m[k] : undefined);
  const hlLabel =
    hl && snap ? `${RING_META[hl].label} ${fmt1(snap.m[hl])} cm${snap.estimated.includes(hl) ? ' (est.)' : ''}` : undefined;

  return (
    <div className="screen">
      <div className="grid2">
        <div className="card" style={{ padding: 14 }}>
          <div className="label">Peso em jejum</div>
          <div className="stat" style={{ marginTop: 6 }}>
            <span className="v num">
              {last ? fmt1(last.value) : '—'}
              <small>kg</small>
            </span>
            <span className="tiny muted">{last ? fmtLong(last.date) : 'sem pesagem'}</span>
          </div>
        </div>
        <div className="card" style={{ padding: 14 }}>
          <div className="label">Tendência</div>
          <div className="stat" style={{ marginTop: 6 }}>
            <span className="v num">
              {trend.length ? fmt1(trend[trend.length - 1].value) : '—'}
              <small>kg</small>
            </span>
            <span className="tiny muted">média que filtra água</span>
          </div>
        </div>
        <div className="card" style={{ padding: 14 }}>
          <div className="label">Desde o início</div>
          <div className="stat" style={{ marginTop: 6 }}>
            <span className="v">{first && last ? <Delta v={last.value - first.value} unit="kg" invert digits={1} /> : '—'}</span>
            <span className="tiny muted">{first ? `desde ${fmtShort(first.date)}` : ''}</span>
          </div>
        </div>
        <div className="card" style={{ padding: 14 }}>
          <div className="label">Ritmo (14 dias)</div>
          <div className="stat" style={{ marginTop: 6 }}>
            <span className={`v num ${rateWeek !== null && rateWeek >= 0.6 && rateWeek <= 1.2 ? 'pos' : ''}`}>
              {rateWeek !== null ? fmt1(rateWeek) : '—'}
              <small>kg/sem</small>
            </span>
            <span className="tiny muted">meta 0,7–1,2</span>
          </div>
        </div>
      </div>

      <div className="card glow hot">
        <div className="card-title">
          <h3>Modelo 3D</h3>
          <span className="tiny muted">{snap ? fmtLong(snap.date) : 'sem medidas'}</span>
        </div>
        {snap ? (
          <>
            <Suspense fallback={<div className="skeleton" style={{ height: 420 }} />}>
              <Body3D measures={snap.m} ghost={compare && base && idx > 0 ? base.m : null} highlight={hl} view={view} label={hlLabel} />
            </Suspense>
            <div className="chips" style={{ marginTop: 10 }}>
              {(
                [
                  ['front', 'Frente'],
                  ['side', 'Perfil'],
                  ['back', 'Costas'],
                  ['auto', 'Girar'],
                ] as [BodyView, string][]
              ).map(([v, l]) => (
                <button key={v} className={`chip ${view === v ? 'on' : ''}`} onClick={() => setView(v)}>
                  {l}
                </button>
              ))}
            </div>
            {snaps.length > 1 && (
              <div className="stack tight" style={{ marginTop: 10 }}>
                <div className="row between tiny">
                  <span className="muted">Linha do tempo</span>
                  <span className="num cyan">
                    {fmtShort(snap.date)} · {idx + 1}/{snaps.length}
                  </span>
                </div>
                <input type="range" min={0} max={snaps.length - 1} step={1} value={idx} onChange={(e) => setSnapIdx(Number(e.target.value))} />
                <div className="row between tiny dim">
                  <span>{fmtShort(snaps[0].date)}</span>
                  <span>{fmtShort(snaps[snaps.length - 1].date)}</span>
                </div>
                <Switch on={compare} onChange={setCompare} label="Comparar com o primeiro registro" hint="A silhueta azulada mostra como você começou" />
              </div>
            )}
            <div className="legend" style={{ marginTop: 10 }}>
              {RING_KEYS.map((k) => {
                const v = ringValue(k);
                const b0 = base ? base.m[k] : undefined;
                const est = snap.estimated.includes(k);
                return (
                  <button key={k} className={hl === k ? 'on' : ''} onClick={() => setHl(hl === k ? null : k)}>
                    <span>
                      <span className="muted">{RING_META[k].label}</span>
                      <br />
                      <b className="num">{v !== undefined ? fmt1(v) : '—'}</b>
                      <span className="tiny"> cm</span>{' '}
                      {est ? (
                        <span className="tiny warn-text">est.</span>
                      ) : b0 !== undefined && v !== undefined && idx > 0 && !base.estimated.includes(k) ? (
                        <span className="tiny">
                          <Delta v={v - b0} unit="" invert={k !== 'arm' && k !== 'thigh' && k !== 'calf'} digits={1} />
                        </span>
                      ) : null}
                    </span>
                  </button>
                );
              })}
            </div>
            {snap.estimated.length > 0 && (
              <div className="tiny muted" style={{ marginTop: 8 }}>
                “est.” = medida ainda não tirada; o boneco usa uma proporção típica até você registrar.
              </div>
            )}
          </>
        ) : (
          <div className="hint">Registre a primeira medição (peso e medidas) para gerar o seu modelo 3D.</div>
        )}
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn primary" style={{ flex: 1 }} onClick={() => setSheet({})}>
            <Plus size={16} /> Nova medição
          </button>
          <button className="btn" onClick={() => setGuide(!guide)}>
            <Ruler size={16} /> Como medir
          </button>
        </div>
        {guide && (
          <div className="stack tight" style={{ marginTop: 10 }}>
            <div className="hint">Peso todo dia; medidas uma vez por semana (domingo), de manhã, em jejum, depois de urinar. Fita justa sem apertar, paralela ao chão, 2 medições e a média. Membros do lado direito.</div>
            {MEASURES.map((m) => (
              <div key={m.key} className="list-row" style={{ alignItems: 'flex-start' }}>
                <div>
                  <b>{m.label}</b>
                  <div className="tiny muted">{m.guide}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-title">
          <h3>Evolução</h3>
        </div>
        <div className="chips">
          {available.map((m) => (
            <button key={m.key} className={`chip ${metric === m.key ? 'on' : ''}`} onClick={() => setMetric(m.key)}>
              {m.short}
            </button>
          ))}
          {bfSeries.length > 0 && (
            <button className={`chip ${metric === 'bf' ? 'on' : ''}`} onClick={() => setMetric('bf')}>
              % gordura (est.)
            </button>
          )}
        </div>
        <div style={{ marginTop: 10 }}>
          <LineChart series={chartSeries} unit={metric === 'bf' ? '%' : MEASURE_META[metric].unit} digits={metric === 'restingHr' ? 0 : 1} />
        </div>
        {metric === 'weight' && <div className="tiny muted">Linha tracejada = tendência (média móvel). Só pesagens em jejum.</div>}
      </div>

      <div className="card">
        <div className="card-title">
          <h3>Composição estimada</h3>
        </div>
        {profile && (lv.weight || lv.waistNavel) ? (
          <div className="stack tight">
            {comp.bmi !== undefined && <Line k="IMC" v={fmt1(comp.bmi)} note={comp.bmi >= 30 ? 'obesidade grau I' : comp.bmi >= 25 ? 'sobrepeso' : 'faixa normal'} />}
            {comp.whtr !== undefined && <Line k="Cintura ÷ altura" v={comp.whtr.toFixed(2).replace('.', ',')} note={comp.whtr > 0.5 ? `meta < 0,50 (cintura até ${fmtInt(profile.heightCm * 0.5)} cm)` : 'dentro da meta'} />}
            {comp.rfm !== undefined && <Line k="% gordura (RFM)" v={`${fmt1(comp.rfm)}%`} note="pela cintura e altura" />}
            {comp.navy !== undefined ? <Line k="% gordura (Marinha)" v={`${fmt1(comp.navy)}%`} note="pela cintura, pescoço e altura" /> : <Line k="% gordura (Marinha)" v="—" note="meça o pescoço" />}
            {comp.leanMass !== undefined && <Line k="Massa magra" v={`${fmt1(comp.leanMass)} kg`} note={comp.method} />}
            {comp.fatMass !== undefined && <Line k="Massa gorda" v={`${fmt1(comp.fatMass)} kg`} note={comp.method} />}
            <div className="tiny muted" style={{ marginTop: 4 }}>
              Estimativas por fórmula, com erro de alguns pontos percentuais. Servem para ver a tendência; o número exato só com DEXA.
            </div>
          </div>
        ) : (
          <div className="muted small">Registre peso e cintura para calcular.</div>
        )}
      </div>

      <div className="card">
        <div className="card-title">
          <h3>Comparativo</h3>
          <span className="tiny muted">primeira × última</span>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Medida</th>
              <th className="r">Início</th>
              <th className="r">Atual</th>
              <th className="r">Δ</th>
            </tr>
          </thead>
          <tbody>
            {MEASURES.map((m) => {
              const s = seriesOf(ms, m.key);
              if (!s.length) return null;
              const a = s[0];
              const b = s[s.length - 1];
              return (
                <tr key={m.key}>
                  <td>
                    {m.short}
                    <div className="tiny dim">
                      {fmtShort(a.date)} → {fmtShort(b.date)}
                    </div>
                  </td>
                  <td className="r num">{m.key === 'restingHr' ? fmtInt(a.value) : fmt1(a.value)}</td>
                  <td className="r num">{m.key === 'restingHr' ? fmtInt(b.value) : fmt1(b.value)}</td>
                  <td className="r">
                    <Delta v={b.value - a.value} unit="" invert={m.lowerIsBetter} digits={1} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!ms.length && <div className="muted small">Sem medições ainda.</div>}
      </div>

      <div className={`card ${rev.available ? (rev.rec === 'manter' || rev.rec === 'recomposicao' ? 'good' : 'warn') : ''}`}>
        <div className="card-title">
          <h3>{rev.title}</h3>
          {rev.rateKg !== undefined && <span className="num small">{fmt1(rev.rateKg)} kg/sem</span>}
        </div>
        <div className="small">{rev.message}</div>
        {rev.available && (
          <div className="stack tight small" style={{ marginTop: 10 }}>
            {rev.prevAvg !== undefined && rev.lastAvg !== undefined && <Line k="Médias semanais" v={`${fmt1(rev.prevAvg)} → ${fmt1(rev.lastAvg)} kg`} />}
            {rev.adherence !== undefined && <Line k="Aderência (14 dias)" v={`${Math.round(rev.adherence)}%`} note="dias a ±100 kcal da meta" />}
            {rev.waistDelta !== undefined && <Line k="Cintura (15 dias)" v={`${fmtSigned1(rev.waistDelta)} cm`} />}
          </div>
        )}
        {tdee && (
          <div className="hint" style={{ marginTop: 10 }}>
            Gasto real estimado pela balança: <b className="num">{fmtInt(tdee.tdee)} kcal/dia</b> (ingestão média {fmtInt(tdee.avgIntake)}, {fmt1(-tdee.slopeKgWeek)} kg/sem, {tdee.days} dias). Use este número no lugar da estimativa por fórmula.
          </div>
        )}
        {rev.available && !protocol.training.intervalsFrom && (
          <div className="stack tight" style={{ marginTop: 12 }}>
            <div className="label">Liberar o intervalado?</div>
            <Crit ok={crit.tempoRpe} text="Blocos do Tempo 3x4 com RPE até 6" />
            <Crit ok={crit.restingHr} text="FC de repouso estável (até +5 bpm)" />
            <Crit ok={null} text="Cargas da musculação mantidas (confirme com o personal)" />
            <button
              className="btn sm"
              style={{ marginTop: 6 }}
              onClick={() => {
                const when = nextHardDay(protocol.training, today);
                saveProtocols(
                  editFrom(state.protocols, today, (p) => {
                    p.training.intervalsFrom = when;
                  }),
                  `Intervalado liberado a partir de ${fmtShort(when)}`,
                );
              }}
            >
              Liberar a partir de {fmtShort(nextHardDay(protocol.training, today))}
            </button>
          </div>
        )}
      </div>

      <details className="card">
        <summary className="row between">
          <h3 style={{ margin: 0, fontSize: 15 }}>Histórico de medições ({ms.length})</h3>
          <ChevronDown size={18} className="muted" />
        </summary>
        <div className="list" style={{ marginTop: 8 }}>
          {[...sortedMeasurements(ms)].reverse().map((m) => (
            <button key={m.id} className="list-row" style={{ width: '100%', textAlign: 'left' }} onClick={() => setSheet({ m })}>
              <div style={{ width: 88 }}>
                <div className="small">{fmtLong(m.date)}</div>
                <div className="tiny dim">
                  {m.time} · {m.fasting ? 'jejum' : 'sem jejum'}
                </div>
              </div>
              <div className="grow tiny muted" style={{ flex: 1 }}>
                {MEASURES.filter((x) => typeof m[x.key] === 'number')
                  .map((x) => `${x.short} ${x.key === 'restingHr' ? fmtInt(m[x.key] as number) : fmt1(m[x.key] as number)}`)
                  .join(' · ')}
              </div>
            </button>
          ))}
        </div>
      </details>

      {sheet && <MeasureSheet initial={sheet.m} onClose={() => setSheet(null)} />}
    </div>
  );
}

function Line({ k, v, note }: { k: string; v: string; note?: string }) {
  return (
    <div className="row between">
      <span className="muted">{k}</span>
      <span style={{ textAlign: 'right' }}>
        <b className="num">{v}</b>
        {note && <div className="tiny dim">{note}</div>}
      </span>
    </div>
  );
}

function Crit({ ok, text }: { ok: boolean | null; text: string }) {
  return (
    <div className="row small">
      <span className={ok === null ? 'dim' : ok ? 'pos' : 'neg'}>{ok === null ? '○' : ok ? '✓' : '✕'}</span>
      <span className={ok === null ? 'muted' : ''}>{text}</span>
    </div>
  );
}

function fmtSigned1(n: number) {
  const r = Math.round(n * 10) / 10;
  return `${r > 0 ? '+' : r < 0 ? '−' : ''}${fmt1(Math.abs(r))}`;
}
