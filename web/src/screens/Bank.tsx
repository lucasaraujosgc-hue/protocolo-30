import { ChevronDown, Info } from 'lucide-react';
import { useMemo, useState } from 'react';
import { LineChart } from '../components/LineChart';
import { Delta, Segmented } from '../components/ui';
import { addDays, fmtLong, fmtShort } from '../lib/dates';
import { compensationToday, currentWeight, planCompensation, type BankRow } from '../lib/engine';
import { fmtInt } from '../lib/format';
import { MEAL_BY_ID } from '../lib/plan';
import { useStore } from '../lib/store';
import type { CompMode } from '../lib/types';

export function Bank() {
  const { state, today, bank, targets, saveCompensation, saveDay, toast } = useStore();
  const [mode, setMode] = useState<CompMode>('mix');
  const [days, setDays] = useState(3);
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [explain, setExplain] = useState(false);
  const s = state.settings;
  const debt = Math.max(0, -Math.round(bank.projected));
  const credit = Math.max(0, Math.round(bank.projected));
  const comp = compensationToday(state, today, bank.projected);
  const weight = currentWeight(state, today);

  const plan = useMemo(
    () =>
      planCompensation({
        debt,
        mode,
        days,
        foodShare: 0.5,
        settings: s,
        weightKg: weight,
        z2PerMin: targets.z2.value / 30,
        planKcal: bank.today.target.kcal,
      }),
    [debt, mode, days, s, weight, targets, bank.today.target.kcal],
  );

  const absorb = async (kcal: number) => {
    const ok = await saveDay(today, (d) => {
      d.absorbed = Math.round((d.absorbed ?? 0) + kcal);
    });
    if (ok) toast(`${fmtInt(kcal)} kcal absorvidas: o resultado só atrasa um pouco`, 'info');
    return ok;
  };

  const activate = async () => {
    if (plan.absorbed > 0 && !(await absorb(plan.absorbed))) return;
    const ok = await saveCompensation({
      active: true,
      mode,
      days: plan.daysUsed,
      startDate: addDays(today, 1),
      foodShare: 0.5,
      debt: plan.debt - plan.absorbed,
      perDayFood: plan.perDayFood,
      perDayActive: plan.perDayActive,
      createdAt: new Date().toISOString(),
    });
    if (ok) toast('Plano de compensação ativado a partir de amanhã');
  };

  const series = [{ points: bank.rows.map((r) => ({ date: r.date, value: r.cumulative })), color: '#2ee6ff', area: true }];
  const rows = [...bank.rows].reverse();

  return (
    <div className="screen">
      <div className="card glow hot" style={{ textAlign: 'center' }}>
        <div className="label">Banco de calorias</div>
        <div className="big-num" style={{ fontSize: 46, margin: '10px 0 4px', color: bank.projected >= 0 ? 'var(--green)' : 'var(--red)', textShadow: `0 0 26px ${bank.projected >= 0 ? 'rgba(61,255,168,.45)' : 'rgba(255,85,119,.45)'}` }}>
          {bank.projected >= 0 ? '+' : '−'}
          {fmtInt(Math.abs(bank.projected))}
        </div>
        <div className="small muted">{bank.projected >= 0 ? 'kcal de crédito' : 'kcal de débito'} · projeção com hoje</div>
        <div className="grid2" style={{ marginTop: 14 }}>
          <div className="stat">
            <span className="label">Dias fechados</span>
            <span className="v">
              <Delta v={bank.closed} unit="" />
            </span>
          </div>
          <div className="stat">
            <span className="label">Hoje até agora</span>
            <span className="v">
              <Delta v={bank.today.balance} unit="" />
            </span>
          </div>
        </div>
        <button className="btn sm ghost" style={{ marginTop: 10 }} onClick={() => setExplain(!explain)}>
          <Info size={14} /> Como o banco calcula
        </button>
        {explain && (
          <div className="hint" style={{ textAlign: 'left', marginTop: 8 }}>
            Todo dia é comparado com o plano. <b>Comida:</b> meta − o que comeu (refeição sem registro = plano seguido). <b>Treino:</b> calorias ativas do relógio − meta da sessão; treino não feito tira a meta inteira. <b>Passos:</b> diferença da meta × {fmtInt(1000 * (0.5 * weight) / 1300)} kcal por mil passos. Créditos de treino e passos valem {Math.round(s.creditFactor * 100)}% porque relógios superestimam gasto; débitos valem 100%. Crédito = você está à frente do plano; débito = atrás.
          </div>
        )}
      </div>

      {comp && comp.status !== 'concluida' && (
        <div className={`card ${comp.status === 'expirada' ? 'bad' : 'warn'}`}>
          <div className="card-title">
            <h3>Compensação ativa</h3>
            <span className="num small">{Math.round(comp.progress * 100)}%</span>
          </div>
          <div className="bar">
            <i style={{ width: `${comp.progress * 100}%` }} />
          </div>
          <div className="small" style={{ marginTop: 10 }}>
            {comp.status === 'agendada'
              ? 'Começa amanhã.'
              : comp.status === 'expirada'
                ? `O prazo acabou e faltam ${fmtInt(comp.remainingDebt)} kcal. Cancele e monte outro plano, ou absorva.`
                : `Dia ${comp.dayIndex} de ${comp.of}.`}{' '}
            Por dia: {comp.food > 0 && <b className="num">−{fmtInt(comp.food)} kcal na comida</b>}
            {comp.food > 0 && comp.active > 0 && ' e '}
            {comp.active > 0 && (
              <b className="num">
                +{fmtInt(comp.steps)} passos (~{comp.walkMin} min)
              </b>
            )}
            .
          </div>
          {comp.reductions.length > 0 && (
            <div className="list" style={{ marginTop: 8 }}>
              {comp.reductions.map((r) => (
                <div key={`${r.meal}${r.food}`} className="list-row">
                  <span className="grow">
                    {r.mealName} · {r.foodName}
                  </span>
                  <span className="num small">
                    {r.fromG} → {r.toG} g
                  </span>
                </div>
              ))}
            </div>
          )}
          <button className="btn sm ghost" style={{ marginTop: 8 }} onClick={() => saveCompensation(null)}>
            Cancelar plano
          </button>
        </div>
      )}

      {debt > 0 && (!comp || comp.status === 'expirada') && (
        <div className="card">
          <div className="card-title">
            <h3>Como compensar {fmtInt(debt)} kcal</h3>
          </div>
          <Segmented
            options={[
              { value: 'food', label: 'Comida' },
              { value: 'mix', label: 'Misto' },
              { value: 'exercise', label: 'Exercício' },
            ]}
            value={mode}
            onChange={setMode}
          />
          <div className="label" style={{ margin: '12px 0 6px' }}>
            Em quantos dias
          </div>
          <div className="chips">
            {[1, 2, 3, 5, 7, 10, 14].map((d) => (
              <button key={d} className={`chip ${days === d ? 'on' : ''}`} onClick={() => setDays(d)}>
                {d} dia{d > 1 ? 's' : ''}
              </button>
            ))}
          </div>
          <div className="card hot" style={{ padding: 12, marginTop: 12 }}>
            <div className="label">
              Por dia, durante {plan.daysUsed} dia{plan.daysUsed > 1 ? 's' : ''}
            </div>
            <div className="grid2" style={{ marginTop: 8 }}>
              <div className="stat">
                <span className="tiny muted">Comida</span>
                <span className="v num">{plan.perDayFood > 0 ? `−${fmtInt(plan.perDayFood)}` : '0'}<small>kcal</small></span>
              </div>
              <div className="stat">
                <span className="tiny muted">Atividade extra</span>
                <span className="v num">{plan.perDayActive > 0 ? `+${fmtInt(plan.perDayActive)}` : '0'}<small>kcal ativas</small></span>
              </div>
            </div>
            {plan.perDayActive > 0 && (
              <div className="small muted" style={{ marginTop: 8 }}>
                ≈ +{fmtInt(plan.steps)} passos ({plan.walkMin} min de caminhada) ou {plan.z2Min} min extras de Z2.
              </div>
            )}
            {plan.reductions.length > 0 && (
              <div className="list" style={{ marginTop: 6 }}>
                {plan.reductions.map((r) => (
                  <div key={`${r.meal}${r.food}`} className="list-row">
                    <span className="grow small">
                      {MEAL_BY_ID[r.meal].short} · {r.foodName}
                    </span>
                    <span className="num small">
                      {r.fromG} → {r.toG} g
                    </span>
                  </div>
                ))}
              </div>
            )}
            {plan.notes.map((n) => (
              <div key={n} className="hint warn" style={{ marginTop: 8 }}>
                {n}
              </div>
            ))}
          </div>
          <div className="tiny muted" style={{ margin: '10px 0' }}>
            Limites seguros: até {fmtInt(s.maxFoodCut)} kcal a menos de comida por dia, nunca abaixo de {fmtInt(s.foodFloor)} kcal, e até {fmtInt(s.maxExtraActive)} kcal ativas extras. Nada de pular refeição, jejum longo ou HIIT para compensar.
          </div>
          <button className="btn primary block" onClick={activate}>
            Ativar a partir de amanhã{plan.absorbed > 0 ? ` e absorver ${fmtInt(plan.absorbed)}` : ''}
          </button>
          <button
            className="btn ghost block"
            style={{ marginTop: 8 }}
            onClick={() => {
              if (window.confirm(`Absorver ${fmtInt(debt)} kcal? Nada é compensado; o resultado atrasa uns ${Math.max(1, Math.round(debt / 800))} dia(s). Fica registrado no extrato.`)) absorb(debt);
            }}
          >
            Prefiro absorver (atraso de ~{Math.max(1, Math.round(debt / 800))} dia{Math.round(debt / 800) > 1 ? 's' : ''})
          </button>
        </div>
      )}

      {credit > 0 && (
        <div className="card good">
          <div className="label">Crédito disponível</div>
          <div className="small" style={{ marginTop: 6 }}>
            Você está <b className="num">{fmtInt(credit)} kcal</b> à frente do plano. Dá para usar até{' '}
            <b className="num">{fmtInt(Math.min(credit, 400))} kcal</b> numa refeição livre sem atrasar nada, ou guardar o crédito para acelerar o resultado.
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-title">
          <h3>Saldo acumulado</h3>
        </div>
        <LineChart series={series} unit="kcal" digits={0} zero />
      </div>

      <div className="card">
        <div className="card-title">
          <h3>Extrato</h3>
          <span className="tiny muted">{bank.rows.length} dia(s) fechado(s)</span>
        </div>
        {rows.length === 0 && <div className="muted small">O extrato começa no dia 1 do protocolo ({fmtShort(s.startDate)}).</div>}
        <div className="list">
          {rows.map((r) => (
            <LedgerRow key={r.date} r={r} open={openRow === r.date} onToggle={() => setOpenRow(openRow === r.date ? null : r.date)} cf={s.creditFactor} />
          ))}
        </div>
      </div>
    </div>
  );
}

function LedgerRow({ r, open, onToggle, cf }: { r: BankRow; open: boolean; onToggle: () => void; cf: number }) {
  const ev = r.ev;
  return (
    <div style={{ borderBottom: '1px dashed rgba(120,200,255,.1)' }}>
      <button className="row" style={{ width: '100%', padding: '10px 0', textAlign: 'left' }} onClick={onToggle}>
        <div style={{ width: 92 }}>
          <div className="small">{fmtLong(r.date)}</div>
          <div className="tiny dim">dia {ev.dayNumber}</div>
        </div>
        <div className="grow tiny muted" style={{ flex: 1 }}>
          C <Delta v={ev.foodDev} unit="" /> · T <Delta v={ev.exDevAdj} unit="" /> · P <Delta v={ev.stepsDevAdj} unit="" />
        </div>
        <b>
          <Delta v={ev.balance} unit="" />
        </b>
        <ChevronDown size={16} className="muted" style={{ transform: open ? 'rotate(180deg)' : undefined }} />
      </button>
      {open && (
        <div className="stack tight small" style={{ paddingBottom: 12 }}>
          {ev.meals
            .filter((m) => m.log && m.log.status !== 'planned')
            .map((m) => (
              <div key={m.meal.id} className="row between">
                <span className="muted">{m.meal.name}</span>
                <Delta v={Math.round(m.planned.kcal) - m.actual.kcal} />
              </div>
            ))}
          {ev.extras.kcal > 0 && (
            <div className="row between">
              <span className="muted">Fora do plano</span>
              <Delta v={-ev.extras.kcal} />
            </div>
          )}
          {ev.sessions.map((s) => (
            <div key={s.planned.key} className="row between">
              <span className="muted">
                {s.planned.label} · {s.state === 'pending' ? 'sem registro' : s.state === 'missed' ? 'não feito' : 'feito'}
              </span>
              <Delta v={s.dev > 0 ? s.dev * cf : s.dev} />
            </div>
          ))}
          {ev.extraSessions.map((x) => (
            <div key={x.log.id} className="row between">
              <span className="muted">Treino extra</span>
              <Delta v={x.dev * cf} />
            </div>
          ))}
          <div className="row between">
            <span className="muted">Passos {ev.steps !== undefined ? `(${fmtInt(ev.steps)})` : '(sem registro)'}</span>
            <Delta v={ev.stepsDevAdj} />
          </div>
          {ev.absorbed > 0 && (
            <div className="row between">
              <span className="muted">Débito absorvido (atraso aceito)</span>
              <Delta v={ev.absorbed} />
            </div>
          )}
          {ev.target.kcal !== Math.round(ev.planned.kcal) && <div className="tiny dim">Meta do dia: {fmtInt(ev.target.kcal)} kcal</div>}
        </div>
      )}
    </div>
  );
}
