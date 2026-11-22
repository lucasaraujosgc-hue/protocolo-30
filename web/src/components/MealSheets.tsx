import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import { makeMealLog, scaleT, uid, roundT } from '../lib/engine';
import { fmtInt } from '../lib/format';
import { itemLabel, itemTotals, mealTotals, type Meal } from '../lib/plan';
import { useStore } from '../lib/store';
import type { LogItem, MealLog, MealStatus } from '../lib/types';
import { FoodPicker } from './FoodPicker';
import { Delta, MacroChips, Segmented, Sheet } from './ui';

export const STATUS_LABEL: Record<MealStatus, string> = {
  planned: 'Seguiu o plano',
  more: 'Comeu a mais',
  less: 'Comeu menos',
  skipped: 'Pulou',
  swapped: 'Trocou',
};

export const STATUS_CHIP: Record<MealStatus, string> = {
  planned: 'ok',
  more: 'warn',
  less: 'info',
  skipped: 'bad',
  swapped: 'info',
};

export function MealLogSheet({
  date,
  meal,
  log,
  initial,
  onClose,
}: {
  date: string;
  meal: Meal;
  log?: MealLog;
  initial?: MealStatus;
  onClose: () => void;
}) {
  const { saveDay, toast } = useStore();
  const [status, setStatus] = useState<MealStatus>(initial ?? log?.status ?? 'planned');
  const [items, setItems] = useState<LogItem[]>(log?.items ?? []);
  const [fraction, setFraction] = useState<number>(log?.fraction ?? 0.5);
  const [note, setNote] = useState(log?.note ?? '');
  const [picker, setPicker] = useState(false);
  const planned = mealTotals(meal);
  const preview = makeMealLog(meal, status, { items, fraction, note });
  const delta = preview.kcal - planned.kcal;

  const save = async () => {
    const ok = await saveDay(date, (d) => {
      d.meals[meal.id] = preview;
    });
    if (ok) {
      toast(`${meal.short}: ${STATUS_LABEL[status].toLowerCase()}`);
      onClose();
    }
  };

  const remove = async () => {
    const ok = await saveDay(date, (d) => {
      delete d.meals[meal.id];
    });
    if (ok) {
      toast('Registro removido (conta como plano seguido)', 'info');
      onClose();
    }
  };

  const addGeneric = (kcal: number) => setItems([...items, { name: `Extra (+${kcal} kcal)`, kcal, p: 0, c: 0, f: 0 }]);
  const addHalf = () => {
    const t = roundT(scaleT(planned, 0.5));
    setItems([...items, { name: 'Meia porção extra do prato', ...t }]);
  };

  return (
    <Sheet title={`${meal.name} · ${meal.time}`} onClose={onClose}>
      <div className="stack">
        <div className="card" style={{ padding: 12 }}>
          <div className="label" style={{ marginBottom: 6 }}>
            Plano
          </div>
          <div className="meal-items" style={{ margin: '0 0 8px' }}>
            {meal.items.map((it, i) => (
              <div key={i} className="meal-item">
                <span>{itemLabel(it)}</span>
                <span className="num muted">{it.grams ? `${it.grams} g` : ''}</span>
                <span className="num">{it.grams ? fmtInt(itemTotals(it).kcal) : ''}</span>
              </div>
            ))}
          </div>
          <MacroChips t={planned} />
        </div>

        <Segmented
          options={[
            { value: 'planned', label: 'Segui' },
            { value: 'more', label: 'A mais' },
            { value: 'less', label: 'A menos' },
            { value: 'skipped', label: 'Pulei' },
            { value: 'swapped', label: 'Troquei' },
          ]}
          value={status}
          onChange={(s) => {
            setStatus(s);
            setPicker(s === 'swapped' && items.length === 0);
          }}
        />

        {status === 'planned' && <div className="hint">Comeu exatamente o plano. Saldo da refeição: zero.</div>}

        {status === 'less' && (
          <div className="stack">
            <div className="label">Quanto da refeição você comeu?</div>
            <div className="chips wrap">
              {[0.75, 0.5, 0.25].map((f) => (
                <button key={f} className={`chip ${fraction === f ? 'on' : ''}`} onClick={() => setFraction(f)}>
                  {f === 0.75 ? '3/4' : f === 0.5 ? 'Metade' : '1/4'}
                </button>
              ))}
            </div>
            <input type="range" min={0} max={100} step={5} value={Math.round(fraction * 100)} onChange={(e) => setFraction(Number(e.target.value) / 100)} />
            <div className="tiny muted">Comeu {Math.round(fraction * 100)}% do prato. Se ficar com fome, priorize a proteína.</div>
          </div>
        )}

        {status === 'skipped' && (
          <div className="hint warn">A refeição conta como 0 kcal. Pular refeições costuma virar fome e exagero depois; comer menos é melhor que pular.</div>
        )}

        {(status === 'more' || status === 'swapped') && (
          <div className="stack">
            <div className="label">{status === 'more' ? 'O que você comeu além do plano' : 'O que você comeu no lugar'}</div>
            {status === 'more' && (
              <div className="chips wrap">
                <button className="chip" onClick={addHalf}>
                  +½ prato
                </button>
                {[100, 200, 300, 500].map((k) => (
                  <button key={k} className="chip" onClick={() => addGeneric(k)}>
                    +{k} kcal
                  </button>
                ))}
              </div>
            )}
            {items.length > 0 && (
              <div className="list">
                {items.map((it, i) => (
                  <div key={i} className="list-row">
                    <div className="grow">
                      <div className="ellipsis">{it.name}</div>
                      <div className="tiny dim">{it.grams ? `${it.grams} g` : it.qty ? `${it.qty}×` : ''}</div>
                    </div>
                    <span className="num">{fmtInt(it.kcal)}</span>
                    <button className="icon-btn" onClick={() => setItems(items.filter((_, j) => j !== i))} aria-label="Remover">
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {picker ? (
              <FoodPicker
                initialTab={status === 'swapped' ? 'presets' : 'foods'}
                onAdd={(it) => {
                  setItems([...items, it]);
                  setPicker(false);
                }}
              />
            ) : (
              <button className="btn block" onClick={() => setPicker(true)}>
                + Adicionar alimento
              </button>
            )}
          </div>
        )}

        <label className="field">
          <span>Observação (opcional)</span>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex.: almoço fora, sem balança" />
        </label>

        <div className="card hot" style={{ padding: 12 }}>
          <div className="row between">
            <span className="label">Resultado</span>
            <Delta v={-delta} />
          </div>
          <div style={{ marginTop: 8 }}>
            <MacroChips t={preview} />
          </div>
          <div className="tiny muted" style={{ marginTop: 6 }}>
            {delta > 0 ? 'Débito no banco de calorias.' : delta < 0 ? 'Crédito no banco de calorias.' : 'Sem efeito no banco.'}
          </div>
        </div>

        <button className="btn primary block" onClick={save}>
          Salvar registro
        </button>
        {log && (
          <button className="btn ghost block" onClick={remove}>
            Remover registro
          </button>
        )}
      </div>
    </Sheet>
  );
}

export function ExtraSheet({ date, onClose }: { date: string; onClose: () => void }) {
  const { saveDay, toast } = useStore();
  const [added, setAdded] = useState<LogItem[]>([]);
  return (
    <Sheet title="Fora do plano" onClose={onClose}>
      <div className="stack">
        <div className="hint">Registre aqui o que comeu fora das refeições: pizza, doce, bebida. Tudo entra como débito no banco.</div>
        <FoodPicker
          initialTab="presets"
          onAdd={async (it) => {
            const ok = await saveDay(date, (d) => {
              d.extras.push({ id: uid(), name: it.name, qty: it.qty, grams: it.grams, kcal: it.kcal, p: it.p, c: it.c, f: it.f, at: new Date().toISOString() });
            });
            if (ok) {
              setAdded([...added, it]);
              toast(`${fmtInt(it.kcal)} kcal registradas`);
            }
          }}
        />
        {added.length > 0 && (
          <div className="tiny muted">
            Adicionado agora: {added.map((a) => a.name).join(', ')} ({fmtInt(added.reduce((a, b) => a + b.kcal, 0))} kcal)
          </div>
        )}
        <button className="btn block" onClick={onClose}>
          Concluir
        </button>
      </div>
    </Sheet>
  );
}
