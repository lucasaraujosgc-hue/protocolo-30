import { useState } from 'react';
import { targetKeyOf, uid } from '../lib/engine';
import { fmtInt } from '../lib/format';
import { SPIN_TEMPLATES, type PlannedSession } from '../lib/schedule';
import { useStore } from '../lib/store';
import type { ExerciseKind, ExerciseLog, ExerciseStatus, SpinTemplate } from '../lib/types';
import { Delta, NumberField, Segmented, Sheet } from './ui';

const RPE_TEXT = ['Repouso', 'Muito leve', 'Leve', 'Leve-moderado', 'Moderado', 'Um pouco forte', 'Forte', 'Bem forte', 'Muito forte', 'Quase máximo', 'Máximo'];

export function ExerciseSheet({
  date,
  planned,
  log,
  onClose,
}: {
  date: string;
  planned?: PlannedSession;
  log?: ExerciseLog;
  onClose: () => void;
}) {
  const { saveDay, targets, state, toast } = useStore();
  const [kind, setKind] = useState<ExerciseKind>(log?.kind ?? planned?.kind ?? 'spinning');
  const [template, setTemplate] = useState<SpinTemplate>(log?.template ?? planned?.template ?? 'z2');
  const [status, setStatus] = useState<ExerciseStatus>(log?.status ?? 'done');
  const [minutes, setMinutes] = useState<number | undefined>(log?.minutes ?? (planned?.kind === 'musculacao' ? 60 : planned ? 30 : undefined));
  const [active, setActive] = useState<number | undefined>(log?.activeKcal);
  const [total, setTotal] = useState<number | undefined>(log?.totalKcal);
  const [hr, setHr] = useState<number | undefined>(log?.avgHr);
  const [rpe, setRpe] = useState<number>(log?.rpe ?? (template === 'z2' ? 4 : 6));
  const [note, setNote] = useState(log?.note ?? '');

  const key = targetKeyOf({ kind, template: kind === 'spinning' ? template : undefined });
  const target = targets[key];
  const cf = state.settings.creditFactor;
  let dev = 0;
  if (planned) {
    dev = status === 'missed' ? -target.value : (active ?? target.value) - target.value;
  } else {
    dev = active ?? 0;
  }
  const bankEffect = dev > 0 ? dev * cf : dev;

  const save = async () => {
    const entry: ExerciseLog = {
      id: log?.id ?? uid(),
      kind,
      template: kind === 'spinning' ? template : undefined,
      status,
      plannedKey: planned?.key,
      minutes: status === 'missed' ? undefined : minutes,
      activeKcal: status === 'missed' ? undefined : active,
      totalKcal: status === 'missed' ? undefined : total,
      avgHr: status === 'missed' ? undefined : hr,
      rpe: status === 'missed' ? undefined : rpe,
      note: note || undefined,
      at: log?.at ?? new Date().toISOString(),
    };
    const ok = await saveDay(date, (d) => {
      const i = d.exercises.findIndex((e) => e.id === entry.id);
      if (i >= 0) d.exercises[i] = entry;
      else d.exercises.push(entry);
    });
    if (ok) {
      toast(status === 'missed' ? 'Treino marcado como não feito' : 'Treino registrado');
      onClose();
    }
  };

  const remove = async () => {
    if (!log) return;
    const ok = await saveDay(date, (d) => {
      d.exercises = d.exercises.filter((e) => e.id !== log.id);
    });
    if (ok) onClose();
  };

  return (
    <Sheet title={planned ? planned.label : log ? 'Editar treino' : 'Treino extra'} onClose={onClose}>
      <div className="stack">
        {planned ? (
          <Segmented
            options={[
              { value: 'done', label: 'Fiz' },
              { value: 'partial', label: 'Fiz parte' },
              { value: 'missed', label: 'Não fiz' },
            ]}
            value={status}
            onChange={setStatus}
          />
        ) : (
          <Segmented
            options={[
              { value: 'spinning', label: 'Spinning' },
              { value: 'musculacao', label: 'Musculação' },
              { value: 'outro', label: 'Outro cardio' },
            ]}
            value={kind}
            onChange={setKind}
          />
        )}

        {kind === 'spinning' && !planned && (
          <div className="chips wrap">
            {(Object.keys(SPIN_TEMPLATES) as SpinTemplate[]).map((t) => (
              <button key={t} className={`chip ${template === t ? 'on' : ''}`} onClick={() => setTemplate(t)}>
                {SPIN_TEMPLATES[t].name}
              </button>
            ))}
          </div>
        )}

        {planned?.kind === 'spinning' && planned.template && (
          <div className="hint">
            {SPIN_TEMPLATES[planned.template].blocks.join(' → ')} · {SPIN_TEMPLATES[planned.template].rpe}
          </div>
        )}

        {status !== 'missed' ? (
          <>
            <div className="grid2">
              <NumberField label="Calorias ativas" value={active} onChange={setActive} suffix="kcal" decimals={false} />
              <NumberField label="Calorias totais" value={total} onChange={setTotal} suffix="kcal" decimals={false} />
              <NumberField label="Duração" value={minutes} onChange={setMinutes} suffix="min" decimals={false} />
              <NumberField label="FC média" value={hr} onChange={setHr} suffix="bpm" decimals={false} />
            </div>
            <div className="tiny muted">Copie do resumo do treino no Apple Watch (app Fitness no iPhone). O banco usa as calorias ativas.</div>
            <div className="field">
              <span>
                Esforço percebido (RPE): <b className="cyan">{rpe}</b> · {RPE_TEXT[rpe]}
              </span>
              <input type="range" min={0} max={10} step={1} value={rpe} onChange={(e) => setRpe(Number(e.target.value))} />
            </div>
          </>
        ) : (
          <div className="hint warn">Sem problema: o débito entra no banco e você escolhe como compensar na aba Banco.</div>
        )}

        <label className="field">
          <span>Observação (opcional)</span>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex.: dormi mal, fiz mais leve" />
        </label>

        <div className="card hot" style={{ padding: 12 }}>
          <div className="row between">
            <span className="label">Efeito no banco</span>
            <Delta v={bankEffect} />
          </div>
          <div className="tiny muted" style={{ marginTop: 6 }}>
            {planned
              ? `Meta desta sessão: ${fmtInt(target.value)} kcal ativas${target.calibrated ? ' (calibrada pelas suas 3 primeiras sessões)' : ''}.`
              : 'Treino fora do plano: as calorias ativas entram como crédito.'}{' '}
            {dev > 0 ? `Créditos de exercício contam ${Math.round(cf * 100)}%, porque relógios superestimam gasto.` : ''}
          </div>
        </div>

        <button className="btn primary block" onClick={save}>
          Salvar
        </button>
        {log && (
          <button className="btn ghost block" onClick={remove}>
            Apagar registro
          </button>
        )}
      </div>
    </Sheet>
  );
}
