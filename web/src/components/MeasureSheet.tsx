import { Info } from 'lucide-react';
import { useState } from 'react';
import { nowHHMM } from '../lib/dates';
import { uid } from '../lib/engine';
import { MEASURES } from '../lib/measures';
import { useStore } from '../lib/store';
import type { Measurement, MeasureKey } from '../lib/types';
import { NumberField, Sheet, Switch } from './ui';

export function MeasureSheet({ initial, onClose }: { initial?: Measurement; onClose: () => void }) {
  const { today, saveMeasurement, deleteMeasurement } = useStore();
  const [m, setM] = useState<Measurement>(
    () =>
      initial ?? {
        id: uid(),
        date: today,
        time: nowHHMM(),
        fasting: new Date().getHours() < 10,
      },
  );
  const [open, setOpen] = useState<MeasureKey | null>(null);
  const set = (k: keyof Measurement, v: unknown) => setM((x) => ({ ...x, [k]: v }));
  const groups = ['Peso', 'Tronco', 'Membros', 'Saúde'] as const;
  const hasAny = MEASURES.some((x) => typeof m[x.key] === 'number') || m.bpSys !== undefined;

  return (
    <Sheet title={initial ? 'Editar medição' : 'Nova medição'} onClose={onClose}>
      <div className="stack">
        <div className="grid2">
          <label className="field">
            <span>Data</span>
            <input className="input" type="date" value={m.date} max={today} onChange={(e) => set('date', e.target.value)} />
          </label>
          <label className="field">
            <span>Hora</span>
            <input className="input" type="time" value={m.time} onChange={(e) => set('time', e.target.value)} />
          </label>
        </div>
        <Switch
          on={m.fasting}
          onChange={(v) => set('fasting', v)}
          label="Em jejum, ao acordar"
          hint="Só pesagens em jejum entram na tendência e na revisão. Medidas à noite ficam no histórico, mas não se comparam com as da manhã."
        />
        <div className="hint">Fita justa sem apertar, paralela ao chão. Meça 2 vezes e anote a média. Braço, coxa e panturrilha do lado direito. Deixe em branco o que não mediu.</div>

        {groups.map((g) => (
          <div key={g} className="stack tight">
            <div className="label" style={{ marginTop: 6 }}>
              {g}
            </div>
            <div className="grid2">
              {MEASURES.filter((x) => x.group === g).map((x) => (
                <div key={x.key} style={{ gridColumn: open === x.key ? '1 / -1' : undefined }}>
                  <NumberField
                    label={
                      <span className="row" style={{ gap: 6 }}>
                        <i style={{ width: 8, height: 8, borderRadius: 8, background: x.color, display: 'inline-block' }} />
                        {x.short}
                        <button type="button" onClick={() => setOpen(open === x.key ? null : x.key)} aria-label={`Como medir ${x.label}`} style={{ color: 'var(--dim)', display: 'inline-flex' }}>
                          <Info size={13} />
                        </button>
                      </span>
                    }
                    value={m[x.key] as number | undefined}
                    onChange={(v) => set(x.key, v)}
                    suffix={x.unit}
                    decimals={x.key !== 'restingHr'}
                  />
                  {open === x.key && <div className="tiny muted" style={{ marginTop: 6 }}>{x.guide}</div>}
                </div>
              ))}
              {g === 'Saúde' && (
                <div className="grid2" style={{ gridColumn: '1 / -1' }}>
                  <NumberField label="Pressão (máxima)" value={m.bpSys} onChange={(v) => set('bpSys', v)} suffix="mmHg" decimals={false} />
                  <NumberField label="Pressão (mínima)" value={m.bpDia} onChange={(v) => set('bpDia', v)} suffix="mmHg" decimals={false} />
                </div>
              )}
            </div>
          </div>
        ))}

        <label className="field">
          <span>Observação (opcional)</span>
          <input className="input" value={m.note ?? ''} onChange={(e) => set('note', e.target.value || undefined)} />
        </label>

        <button
          className="btn primary block"
          disabled={!hasAny}
          onClick={async () => {
            if (await saveMeasurement(m)) onClose();
          }}
        >
          Salvar medição
        </button>
        {initial && (
          <button
            className="btn danger block"
            onClick={async () => {
              if (window.confirm('Apagar esta medição? Não dá para desfazer.') && (await deleteMeasurement(initial.id))) onClose();
            }}
          >
            Apagar medição
          </button>
        )}
      </div>
    </Sheet>
  );
}
