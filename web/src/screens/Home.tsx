import { Bike, Check, Dumbbell, Minus, Pizza, Plus, Repeat, Scale, Footprints, X, ArrowRight } from 'lucide-react';
import { useState } from 'react';
import { ExerciseSheet } from '../components/ExerciseSheet';
import { ExtraSheet, MealLogSheet, STATUS_CHIP, STATUS_LABEL } from '../components/MealSheets';
import { MeasureSheet } from '../components/MeasureSheet';
import { Delta, MacroBars, MacroChips, NumberField, Ring } from '../components/ui';
import { fmtFull, fmtShort, nowHHMM } from '../lib/dates';
import { compensationToday, currentMealIndex, currentWeight, kcalPerStep, makeMealLog, uid, type SessionEval } from '../lib/engine';
import { fmt1, fmtInt } from '../lib/format';
import { MEALS, itemLabel, itemTotals } from '../lib/plan';
import { SPIN_TEMPLATES } from '../lib/schedule';
import { useStore } from '../lib/store';
import type { ExerciseLog, MealStatus } from '../lib/types';
import type { TabId } from '../App';

export function Home({ go }: { go: (t: TabId) => void }) {
  const { state, today, nowMin, bank, saveDay, saveMeasurement, toast } = useStore();
  const ev = bank.today;
  const comp = compensationToday(state, today, bank.projected);
  const { index, phase } = currentMealIndex(nowMin);
  const meal = MEALS[index];
  const me = ev.meals[index];
  const [sheet, setSheet] = useState<
    | { t: 'meal'; status?: MealStatus; mealIndex: number }
    | { t: 'ex'; session?: SessionEval; log?: ExerciseLog }
    | { t: 'extra' }
    | { t: 'measure' }
    | null
  >(null);
  const [stepsInput, setStepsInput] = useState<number | undefined>(undefined);
  const [weightInput, setWeightInput] = useState<number | undefined>(undefined);

  const compFood = comp && comp.status === 'ativa' ? comp.food : 0;
  const compSteps = comp && comp.status === 'ativa' ? comp.steps : 0;
  const kcalTarget = ev.target.kcal - compFood;
  const remaining = kcalTarget - Math.round(ev.consumed.kcal);
  const week = Math.max(1, Math.ceil(ev.dayNumber / 7));
  const stepsTarget = ev.stepsTarget + compSteps;
  const weight = currentWeight(state, today);
  const todayWeights = state.measurements.filter((m) => m.date === today && m.weight);
  const pendingBefore = ev.pendingMeals.filter((id) => MEALS.findIndex((m) => m.id === id) < index);

  const quickPlanned = async (i: number) => {
    const m = MEALS[i];
    const ok = await saveDay(today, (d) => {
      d.meals[m.id] = makeMealLog(m, 'planned');
    });
    if (ok) toast(`${m.short} registrado conforme o plano`);
  };

  const saveSteps = async () => {
    if (stepsInput === undefined) return;
    const ok = await saveDay(today, (d) => {
      d.steps = Math.round(stepsInput);
    });
    if (ok) {
      toast('Passos atualizados');
      setStepsInput(undefined);
    }
  };

  const saveWeight = async () => {
    if (!weightInput) return;
    // Corrigir o peso do dia atualiza o registro de hoje em vez de criar outro.
    const existing = state.measurements.find((m) => m.date === today && m.weight !== undefined);
    const ok = await saveMeasurement(
      existing
        ? { ...existing, weight: weightInput }
        : { id: uid(), date: today, time: nowHHMM(), fasting: new Date().getHours() < 10, weight: weightInput },
    );
    if (ok) setWeightInput(undefined);
  };

  return (
    <div className="screen">
      <div className="row between" style={{ alignItems: 'flex-end' }}>
        <div>
          <div className="label">{fmtFull(today)}</div>
          {ev.dayNumber >= 1 ? (
            <div className="hero-day">
              <span className="gradient-text">DIA {ev.dayNumber}</span>
              <span className="of"> / 30</span>
            </div>
          ) : (
            <div className="hero-day">
              <span className="gradient-text">EM {1 - ev.dayNumber} DIA{1 - ev.dayNumber > 1 ? 'S' : ''}</span>
            </div>
          )}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="label">{ev.dayNumber >= 1 ? `Semana ${week}` : 'Início'}</div>
          <div className="small muted">{ev.dayNumber >= 1 ? (ev.dayNumber > 30 ? 'Fase seguinte' : 'Protocolo 30') : fmtShort(state.settings.startDate)}</div>
        </div>
      </div>

      <div className="card glow hot">
        <div className="row" style={{ gap: 16, alignItems: 'center' }}>
          <Ring value={ev.consumed.kcal} max={kcalTarget} size={150} stroke={12}>
            <div>
              <div className="label" style={{ fontSize: 9 }}>
                Consumido
              </div>
              <div className="big-num" style={{ fontSize: 28 }}>
                {fmtInt(ev.consumed.kcal)}
              </div>
              <div className="tiny muted num">/ {fmtInt(kcalTarget)} kcal</div>
            </div>
          </Ring>
          <div className="stack" style={{ flex: 1, minWidth: 0 }}>
            <div>
              <div className="label">{remaining >= 0 ? 'Restante hoje' : 'Acima da meta'}</div>
              <div className="big-num" style={{ fontSize: 24, color: remaining >= 0 ? 'var(--text)' : 'var(--red)' }}>
                {fmtInt(Math.abs(remaining))}
                <span className="small muted" style={{ fontFamily: 'var(--font-ui)', fontWeight: 500 }}>
                  {' '}
                  kcal
                </span>
              </div>
              {compFood > 0 && <div className="tiny warn-text">Inclui −{fmtInt(compFood)} kcal de compensação</div>}
            </div>
            <MacroBars actual={ev.consumed} target={ev.target} compact />
          </div>
        </div>
      </div>

      {comp && <CompBanner go={go} />}

      <div className="card glow">
        <div className="row between">
          <span className="label">
            {phase === 'antes' ? 'Próxima refeição' : phase === 'encerrado' ? 'Última refeição do dia' : 'Refeição atual'} · {meal.time}
          </span>
          {me.log && <span className={`chip ${STATUS_CHIP[me.log.status]}`}>{STATUS_LABEL[me.log.status]}</span>}
        </div>
        <div style={{ marginTop: 6 }}>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{meal.name}</div>
          <div className="tiny muted">{meal.hint}</div>
        </div>
        <div className="meal-items">
          {meal.items.map((it, i) => {
            const cut = comp?.status === 'ativa' ? comp.reductions.find((r) => r.meal === meal.id && r.food === it.food) : undefined;
            return (
              <div key={i} className="meal-item">
                <span>
                  {itemLabel(it)}
                  {cut && <div className="tiny warn-text">Hoje: {cut.toG} g (compensação)</div>}
                </span>
                <span className="num muted">{it.grams ? `${it.grams} g` : ''}</span>
                <span className="num">{it.grams ? fmtInt(itemTotals(it).kcal) : ''}</span>
              </div>
            );
          })}
        </div>
        <MacroChips t={me.actual} />
        <div className="actions" style={{ marginTop: 14 }}>
          <button className="action ok" onClick={() => quickPlanned(index)}>
            <Check size={20} />
            Segui
          </button>
          <button className="action more" onClick={() => setSheet({ t: 'meal', status: 'more', mealIndex: index })}>
            <Plus size={20} />A mais
          </button>
          <button className="action less" onClick={() => setSheet({ t: 'meal', status: 'less', mealIndex: index })}>
            <Minus size={20} />A menos
          </button>
          <button className="action skip" onClick={() => setSheet({ t: 'meal', status: 'skipped', mealIndex: index })}>
            <X size={20} />
            Pulei
          </button>
          <button className="action swap" onClick={() => setSheet({ t: 'meal', status: 'swapped', mealIndex: index })}>
            <Repeat size={20} />
            Troquei
          </button>
        </div>
        {phase === 'agora' && MEALS[index + 1] && (
          <div className="row between small" style={{ marginTop: 12 }}>
            <span className="muted">
              Depois: <b style={{ color: 'var(--text)' }}>{MEALS[index + 1].name}</b> às {MEALS[index + 1].time}
            </span>
            <button className="btn sm ghost" onClick={() => go('plano')}>
              Ver dia <ArrowRight size={14} />
            </button>
          </div>
        )}
      </div>

      {pendingBefore.length > 0 && (
        <div className="hint">
          Sem registro: {pendingBefore.map((id) => MEALS.find((m) => m.id === id)!.short).join(', ')}. Sem registro, a refeição conta como seguida.{' '}
          <button className="cyan" style={{ textDecoration: 'underline' }} onClick={() => go('plano')}>
            Revisar
          </button>
        </div>
      )}

      <div className="card">
        <div className="card-title">
          <h3>Treinos de hoje</h3>
          <button className="btn sm ghost" onClick={() => setSheet({ t: 'ex' })}>
            <Plus size={14} /> Extra
          </button>
        </div>
        {ev.sessions.length === 0 && ev.extraSessions.length === 0 && <div className="muted small">Dia de descanso. Uma caminhada leve conta nos passos.</div>}
        {ev.sessions.map((s) => (
          <SessionRow key={s.planned.key} s={s} onClick={() => setSheet({ t: 'ex', session: s, log: s.log })} />
        ))}
        {ev.extraSessions.map(({ log, dev }) => (
          <div key={log.id} className="session" onClick={() => setSheet({ t: 'ex', log })} role="button">
            <div className={`session-icon ${log.kind === 'musculacao' ? 'lift' : ''}`}>{log.kind === 'musculacao' ? <Dumbbell size={20} /> : <Bike size={20} />}</div>
            <div>
              <div style={{ fontWeight: 600 }}>Extra · {log.kind === 'spinning' ? SPIN_TEMPLATES[log.template ?? 'livre'].name : log.kind === 'musculacao' ? 'Musculação' : 'Cardio'}</div>
              <div className="tiny muted">{log.activeKcal ? `${fmtInt(log.activeKcal)} kcal ativas` : 'sem calorias'}</div>
            </div>
            <Delta v={dev * state.settings.creditFactor} />
          </div>
        ))}
      </div>

      <div className="grid2">
        <div className="card" style={{ padding: 14 }}>
          <div className="row between">
            <span className="label">Passos</span>
            <Footprints size={16} className="cyan" />
          </div>
          <div className="stat" style={{ margin: '6px 0 8px' }}>
            <span className="v num">
              {ev.steps !== undefined ? fmtInt(ev.steps) : '—'}
              <small>/ {fmtInt(stepsTarget)}</small>
            </span>
          </div>
          <div className="bar">
            <i style={{ width: `${Math.min(100, ((ev.steps ?? 0) / stepsTarget) * 100)}%` }} />
          </div>
          <div className="tiny muted" style={{ margin: '6px 0' }}>
            {ev.steps !== undefined && ev.steps < stepsTarget
              ? `Faltam ${fmtInt(stepsTarget - ev.steps)} (~${fmtInt(((stepsTarget - ev.steps) * kcalPerStep(weight)))} kcal)`
              : compSteps > 0
                ? `Inclui +${fmtInt(compSteps)} de compensação`
                : 'Atualize à noite pelo app Atividade'}
          </div>
          <div className="row" style={{ gap: 6 }}>
            <NumberField value={stepsInput} onChange={setStepsInput} placeholder="total" decimals={false} />
            <button className="btn sm" disabled={stepsInput === undefined} onClick={saveSteps}>
              OK
            </button>
          </div>
        </div>
        <div className="card" style={{ padding: 14 }}>
          <div className="row between">
            <span className="label">Peso hoje</span>
            <Scale size={16} className="cyan" />
          </div>
          <div className="stat" style={{ margin: '6px 0 8px' }}>
            <span className="v num">
              {todayWeights.length ? fmt1(todayWeights[todayWeights.length - 1].weight!) : '—'}
              <small>kg</small>
            </span>
          </div>
          <div className="tiny muted" style={{ marginBottom: 6 }}>
            {todayWeights.length ? (todayWeights.some((w) => w.fasting) ? 'Em jejum ✓' : 'Fora do jejum') : 'Em jejum, ao acordar'}
          </div>
          <div className="row" style={{ gap: 6 }}>
            <NumberField value={weightInput} onChange={setWeightInput} placeholder="kg" />
            <button className="btn sm" disabled={!weightInput} onClick={saveWeight}>
              OK
            </button>
          </div>
          <button className="btn sm ghost block" style={{ marginTop: 6 }} onClick={() => setSheet({ t: 'measure' })}>
            Medidas completas
          </button>
        </div>
      </div>

      <div className="card" onClick={() => go('banco')} role="button">
        <div className="row between">
          <div>
            <div className="label">Banco de calorias</div>
            <div className="big-num" style={{ fontSize: 28, marginTop: 4, color: bank.projected >= 0 ? 'var(--green)' : 'var(--red)' }}>
              {bank.projected >= 0 ? '+' : '−'}
              {fmtInt(Math.abs(bank.projected))}
              <span className="small muted" style={{ fontFamily: 'var(--font-ui)', fontWeight: 500 }}>
                {' '}
                kcal
              </span>
            </div>
            <div className="tiny muted">
              Dias fechados <Delta v={bank.closed} unit="" /> · hoje (projeção) <Delta v={ev.balance} unit="" />
            </div>
          </div>
          <ArrowRight size={20} className="muted" />
        </div>
      </div>

      <div className="card">
        <div className="row between">
          <div>
            <div className="label">Fora do plano hoje</div>
            <div className="small" style={{ marginTop: 4 }}>
              {ev.extras.kcal > 0 ? (
                <>
                  <b className="num">{fmtInt(ev.extras.kcal)} kcal</b> registradas
                </>
              ) : (
                <span className="muted">Nada registrado</span>
              )}
            </div>
          </div>
          <button className="btn sm" onClick={() => setSheet({ t: 'extra' })}>
            <Pizza size={15} /> Registrar
          </button>
        </div>
      </div>

      {sheet?.t === 'meal' && (
        <MealLogSheet
          date={today}
          meal={MEALS[sheet.mealIndex]}
          log={ev.meals[sheet.mealIndex].log}
          initial={sheet.status}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet?.t === 'ex' && <ExerciseSheet date={today} planned={sheet.session?.planned} log={sheet.log} onClose={() => setSheet(null)} />}
      {sheet?.t === 'extra' && <ExtraSheet date={today} onClose={() => setSheet(null)} />}
      {sheet?.t === 'measure' && <MeasureSheet onClose={() => setSheet(null)} />}
    </div>
  );
}

export function SessionRow({ s, onClick }: { s: SessionEval; onClick: () => void }) {
  const { state } = useStore();
  const cf = state.settings.creditFactor;
  const st = s.state;
  return (
    <div className="session" onClick={onClick} role="button">
      <div className={`session-icon ${s.planned.kind === 'musculacao' ? 'lift' : ''}`}>
        {s.planned.kind === 'musculacao' ? <Dumbbell size={20} /> : <Bike size={20} />}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 600 }}>
          <span className="num muted small">{s.planned.time}</span> {s.planned.label}
        </div>
        <div className="tiny muted ellipsis">
          {s.log && s.log.status !== 'missed'
            ? `${s.log.activeKcal ? `${fmtInt(s.log.activeKcal)} kcal ativas` : 'feito'}${s.log.avgHr ? ` · FC ${s.log.avgHr}` : ''}${s.log.rpe !== undefined ? ` · RPE ${s.log.rpe}` : ''}`
            : s.planned.detail}
        </div>
      </div>
      {st === 'pending' ? (
        <span className="chip">Registrar</span>
      ) : st === 'missed' ? (
        <span className="chip bad">Não fiz</span>
      ) : (
        <span className={`chip ${s.dev >= 0 ? 'ok' : 'warn'}`}>
          {s.dev === 0 ? 'Feito' : <Delta v={s.dev > 0 ? s.dev * cf : s.dev} unit="" />}
        </span>
      )}
    </div>
  );
}

function CompBanner({ go }: { go: (t: TabId) => void }) {
  const { state, today, bank, saveCompensation } = useStore();
  const c = compensationToday(state, today, bank.projected);
  if (!c) return null;
  if (c.status === 'concluida') {
    return (
      <div className="card good">
        <div className="row between">
          <div>
            <div className="label">Compensação</div>
            <div style={{ fontWeight: 700, marginTop: 4 }}>Débito quitado. Banco no positivo.</div>
          </div>
          <button className="btn sm" onClick={() => saveCompensation(state.compensation ? { ...state.compensation, active: false } : null)}>
            Encerrar
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className={`card ${c.status === 'expirada' ? 'bad' : 'warn'}`} onClick={() => go('banco')} role="button">
      <div className="row between">
        <span className="label">
          Compensação · {c.status === 'agendada' ? 'começa amanhã' : c.status === 'expirada' ? 'prazo encerrado' : `dia ${c.dayIndex} de ${c.of}`}
        </span>
        <span className="num small">{Math.round(c.progress * 100)}%</span>
      </div>
      <div className="bar" style={{ margin: '10px 0' }}>
        <i style={{ width: `${c.progress * 100}%` }} />
      </div>
      {c.status === 'expirada' ? (
        <div className="small">Ainda faltam {fmtInt(c.remainingDebt)} kcal. Abra o Banco para refazer o plano ou absorver.</div>
      ) : (
        <div className="small">
          {c.food > 0 && (
            <>
              Comida <b className="num">−{fmtInt(c.food)} kcal</b>
            </>
          )}
          {c.food > 0 && c.active > 0 && ' · '}
          {c.active > 0 && (
            <>
              +<b className="num">{fmtInt(c.steps)}</b> passos (~{c.walkMin} min de caminhada)
            </>
          )}
        </div>
      )}
    </div>
  );
}
