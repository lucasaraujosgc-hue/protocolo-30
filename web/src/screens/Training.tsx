import { Bike, Footprints, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ExerciseSheet } from '../components/ExerciseSheet';
import { DateNav, Delta, NumberField } from '../components/ui';
import { addDays, diffDays, fmtShort, parseISO, weekday } from '../lib/dates';
import { currentWeight, evalDay, kcalPerStep, protoAt, type DayEval, type SessionEval } from '../lib/engine';
import { fmtInt } from '../lib/format';
import { ZONE_COLORS } from '../lib/schedule';
import { useStore } from '../lib/store';
import type { ExerciseLog, SpinTemplate } from '../lib/types';
import { ExtraSessionRow, SessionRow, exerciseName } from './Home';

export function Training() {
  const { state, today, nowMin, samples, saveDay, toast } = useStore();
  const [date, setDate] = useState(today);
  const [sheet, setSheet] = useState<{ session?: SessionEval; log?: ExerciseLog } | null>(null);
  const [steps, setSteps] = useState<number | undefined>(undefined);
  const opts = { today, nowMin, samples };
  const ev = useMemo(() => evalDay(state, date, opts), [state, date, today, nowMin, samples]); // eslint-disable-line react-hooks/exhaustive-deps
  const start = state.settings.startDate;
  // Zonas e treinos mostrados são os da versão do protocolo do dia selecionado.
  const training = ev.protocol.training;

  // Calendário do protocolo: começa na segunda da semana de início e cobre o dia 30
  // (ou até a semana atual, se você seguir depois do dia 30).
  const span = Math.max(30, diffDays(today, start) + 1);
  const offset = (weekday(start) + 6) % 7;
  const calStart = addDays(start, -offset);
  const calDays = Array.from({ length: Math.ceil((offset + span) / 7) * 7 }, (_, i) => addDays(calStart, i));
  const evals = useMemo(() => {
    const m: Record<string, DayEval> = {};
    for (const d of calDays) m[d] = evalDay(state, d, opts);
    return m;
  }, [state, today, nowMin, samples]); // eslint-disable-line react-hooks/exhaustive-deps

  const history = useMemo(() => {
    const out: { date: string; log: ExerciseLog }[] = [];
    for (const d of Object.keys(state.days).sort().reverse()) for (const log of state.days[d].exercises) out.push({ date: d, log });
    return out.slice(0, 25);
  }, [state.days]);

  const weight = currentWeight(state, date);
  const protocolAt = (d: string) => protoAt(state, d);

  return (
    <div className="screen">
      <DateNav date={date} today={today} onChange={setDate} />

      <div className="card glow">
        <div className="card-title">
          <h3>{date === today ? 'Treinos de hoje' : 'Treinos do dia'}</h3>
          <button className="btn sm ghost" onClick={() => setSheet({})}>
            <Plus size={14} /> Extra
          </button>
        </div>
        {ev.sessions.length === 0 && ev.extraSessions.length === 0 && <div className="muted small">Sem treino planejado. Descanso total ou caminhada leve.</div>}
        {ev.sessions.map((s) => (
          <SessionRow key={s.planned.key} s={s} cf={ev.creditFactor} onClick={() => setSheet({ session: s, log: s.log })} />
        ))}
        {ev.extraSessions.map(({ log, dev }) => (
          <ExtraSessionRow key={log.id} log={log} dev={dev} cf={ev.creditFactor} sessionName={exerciseName(ev.protocol, log)} onClick={() => setSheet({ log })} />
        ))}
        {!ev.isFuture && ev.inProtocol && (
          <div className="row between small" style={{ marginTop: 8 }}>
            <span className="muted">Saldo de treino no banco</span>
            <Delta v={ev.exDevAdj} />
          </div>
        )}
      </div>

      <div className="card">
        <div className="row between">
          <span className="label">Passos do dia</span>
          <Footprints size={16} className="cyan" />
        </div>
        <div className="row between" style={{ margin: '8px 0' }}>
          <span className="big-num" style={{ fontSize: 24 }}>
            {ev.steps !== undefined ? fmtInt(ev.steps) : '—'}
          </span>
          <span className="small muted">meta {fmtInt(ev.stepsTarget)}</span>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <NumberField value={steps} onChange={setSteps} placeholder="Passos do dia" decimals={false} />
          <button
            className="btn"
            disabled={steps === undefined}
            onClick={async () => {
              if (await saveDay(date, (d) => void (d.steps = Math.round(steps!)))) {
                toast('Passos salvos');
                setSteps(undefined);
              }
            }}
          >
            Salvar
          </button>
        </div>
        <div className="tiny muted" style={{ marginTop: 6 }}>
          Cada 1.000 passos ≈ {fmtInt(1000 * kcalPerStep(weight))} kcal para o seu peso. Caminhadas entram por aqui, não como treino.
        </div>
      </div>

      <div className="card">
        <div className="card-title">
          <h3>Calendário do protocolo</h3>
          <span className="tiny muted">toque num dia</span>
        </div>
        <div className="cal-grid">
          {['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB', 'DOM'].map((d) => (
            <div key={d} className="cal-head">
              {d}
            </div>
          ))}
          {calDays.map((d) => {
            const e = evals[d];
            const n = diffDays(d, start) + 1;
            const out = n < 1 || n > span;
            return (
              <button
                key={d}
                className={`cal-cell ${out ? 'out' : ''} ${d === today ? 'today' : ''} ${d === date ? 'sel' : ''}`}
                onClick={() => setDate(d)}
              >
                <span className="num">{parseISO(d).getDate()}</span>
                <span className="cal-dots">
                  {e.sessions.map((s) => (
                    <i
                      key={s.planned.key}
                      className={`${s.planned.key === 'spin' ? 'spin' : 'lift'} ${s.state === 'missed' ? 'missed' : s.state === 'pending' ? 'pending' : 'done'}`}
                    />
                  ))}
                </span>
              </button>
            );
          })}
        </div>
        <div className="row wrap tiny muted" style={{ marginTop: 10, gap: 12 }}>
          <span>
            <i style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 8, background: 'var(--cyan)' }} /> Spinning
          </span>
          <span>
            <i style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 8, background: 'var(--violet)' }} /> Musculação
          </span>
          <span>
            <i style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 8, background: 'var(--red)' }} /> Não feito
          </span>
          <span>Apagado = pendente</span>
        </div>
      </div>

      <div className="card">
        <div className="card-title">
          <h3>Zonas no Apple Watch</h3>
        </div>
        {training.zones.map((z) => (
          <div key={z.z} className="zone-bar">
            <b style={{ color: ZONE_COLORS[Math.min(ZONE_COLORS.length, Math.max(1, z.z)) - 1] }}>Z{z.z}</b>
            <span className="num small">{z.range}</span>
            <span className="small muted">{z.use}</span>
          </div>
        ))}
        <div className="tiny muted" style={{ marginTop: 8 }}>
          Configure em Ajustes do relógio → Exercício → Zonas de Batimentos Cardíacos → Manual (zonas 2, 3 e 4).
        </div>
      </div>

      <div className="card">
        <div className="card-title">
          <h3>Exercícios personalizados</h3>
          <span className="tiny muted">Bicicleta Interna</span>
        </div>
        {(['z2', 'tempo', 'intervalado'] as SpinTemplate[]).map((t) => (
          <div key={t} className="list-row" style={{ alignItems: 'flex-start' }}>
            <div className="session-icon">
              <Bike size={18} />
            </div>
            <div className="grow">
              <div style={{ fontWeight: 700 }}>
                {training.sessions[t].name}{' '}
                <span className="tiny muted">
                  · {training.sessions[t].zone} · {training.sessions[t].hr}
                </span>
              </div>
              {training.sessions[t].blocks.map((b, i) => (
                <div key={i} className="tiny muted">
                  {b}
                </div>
              ))}
              <div className="tiny cyan">{training.sessions[t].rpe}</div>
            </div>
          </div>
        ))}
        <div className="tiny muted" style={{ marginTop: 6 }}>
          {training.intervalsFrom
            ? `Intervalado liberado a partir de ${fmtShort(training.intervalsFrom)}.`
            : 'O intervalado entra só depois da revisão do dia 14 (aba Progresso).'}
        </div>
      </div>

      <div className="card">
        <div className="card-title">
          <h3>Histórico</h3>
        </div>
        {history.length === 0 && <div className="muted small">Nenhum treino registrado ainda.</div>}
        <div className="list">
          {history.map(({ date: d, log }) => (
            <div key={log.id} className="list-row" onClick={() => setDate(d)} role="button">
              <span className="num muted small" style={{ width: 42 }}>
                {fmtShort(d)}
              </span>
              <div className="grow">
                <div className="ellipsis">
                  {exerciseName(protocolAt(d), log)}
                  {log.status === 'missed' ? ' · não feito' : log.status === 'partial' ? ' · parcial' : ''}
                </div>
                <div className="tiny dim">
                  {[log.minutes && `${log.minutes} min`, log.avgHr && `FC ${log.avgHr}`, log.rpe !== undefined && `RPE ${log.rpe}`, log.totalKcal && `${fmtInt(log.totalKcal)} kcal totais`]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
              </div>
              <span className="num small">{log.activeKcal ? `${fmtInt(log.activeKcal)}` : '—'}</span>
            </div>
          ))}
        </div>
      </div>

      {sheet && <ExerciseSheet date={date} planned={sheet.session?.planned} log={sheet.log} onClose={() => setSheet(null)} />}
    </div>
  );
}
