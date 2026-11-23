import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import { minutesOf } from '../lib/dates';
import { defaultMealTime, makeMealLog, mealWithCuts, plateOf, SHIFT_MIN, uid } from '../lib/engine';
import { fmtInt } from '../lib/format';
import { itemLabel, itemTotals, mealTotals, type Meal, type Plan, type PlanItem, type ReductionStep } from '../lib/plan';
import { useStore } from '../lib/store';
import type { LogItem, MealLog, MealStatus, PortionLog } from '../lib/types';
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

const KCAL_STEPS = [0, 0.5, 1, 1.5, 2];
const PLATE_STEPS: { k: number; label: string }[] = [
  { k: 0.25, label: '¼' },
  { k: 0.5, label: '½' },
  { k: 0.75, label: '¾' },
  { k: 1, label: 'Normal' },
  { k: 1.5, label: '1½' },
  { k: 2, label: '2×' },
];

const parseQty = (v: string) => {
  const n = Number(v.replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const fmtQty = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',');

export function MealLogSheet({
  date,
  plan,
  meal,
  log,
  scheduled,
  initial,
  cuts = [],
  onClose,
}: {
  date: string;
  plan: Plan;
  meal: Meal;
  log?: MealLog;
  /** Horário do dia para esta refeição (já ajustado por atrasos). */
  scheduled: string;
  initial?: MealStatus;
  /** Cortes do dia (compensação ou meta abaixo do cardápio): "Segui" registra o prato reduzido. */
  cuts?: ReductionStep[];
  onClose: () => void;
}) {
  const { saveDay, toast, today, nowMin } = useStore();
  const mine = cuts.filter((c) => c.meal === meal.id);
  const planned = mealTotals(plan, meal);
  const plate = mealWithCuts(meal, mine);
  const plateTotals = mealTotals(plan, plate);
  const adjustable = (it: PlanItem) => (it.food && it.grams !== undefined ? 'grams' : typeof it.kcal === 'number' ? 'mult' : null);
  const defaults = plate.items.map((it) => (adjustable(it) === 'grams' ? it.grams! : adjustable(it) === 'mult' ? 1 : 0));

  const [status, setStatus] = useState<MealStatus>(initial ?? log?.status ?? 'planned');
  const [extras, setExtras] = useState<LogItem[]>(log && log.status !== 'swapped' ? (log.items ?? []) : []);
  const [swaps, setSwaps] = useState<LogItem[]>(log?.status === 'swapped' ? (log.items ?? []) : []);
  const [vals, setVals] = useState<string[]>(() =>
    plate.items.map((it, i) => {
      const p = log?.portions?.find((x) => x.i === i && (x.food ?? null) === (it.food ?? null));
      if (p?.grams !== undefined) return fmtQty(p.grams);
      if (p?.mult !== undefined) return fmtQty(p.mult);
      // Registro antigo de "a menos" guardava só a fração do prato.
      if (log?.status === 'less' && log.fraction !== undefined && !log.portions) return fmtQty(defaults[i] * log.fraction);
      return fmtQty(defaults[i]);
    }),
  );
  const [time, setTime] = useState(() => defaultMealTime({ time: scheduled, log }, date === today, nowMin));
  const [note, setNote] = useState(log?.note ?? '');
  const [picker, setPicker] = useState(initial === 'swapped' && !log?.items?.length);

  const editing = status === 'more' || status === 'less';
  const portions: PortionLog[] = [];
  plate.items.forEach((it, i) => {
    const kind = adjustable(it);
    const v = parseQty(vals[i] ?? '');
    if (!kind || Math.abs(v - defaults[i]) < 0.001) return;
    portions.push(kind === 'grams' ? { i, food: it.food, grams: Math.round(v) } : { i, food: it.food, mult: v });
  });
  const eatsSomething = status !== 'skipped';
  const preview = makeMealLog(plan, meal, status, {
    items: status === 'swapped' ? swaps : extras,
    portions,
    note,
    cuts: mine,
    time: eatsSomething && /^\d{2}:\d{2}$/.test(time) ? time : undefined,
  });
  const delta = Math.round(preview.kcal) - Math.round(planned.kcal);
  // "A mais"/"A menos" é decidido pelo resultado em relação ao prato de hoje.
  const vsPlate = Math.round(preview.kcal) - Math.round(plateTotals.kcal);
  const finalStatus: MealStatus = !editing ? status : vsPlate > 0 ? 'more' : vsPlate < 0 ? 'less' : portions.length || extras.length ? status : 'planned';
  const shift = preview.time ? minutesOf(preview.time) - minutesOf(meal.time) : 0;
  const isLast = plan.meals[plan.meals.length - 1]?.id === meal.id;

  const setAll = (k: number) =>
    setVals(plate.items.map((it, i) => (adjustable(it) === 'grams' ? fmtQty(Math.round(defaults[i] * k)) : adjustable(it) === 'mult' ? fmtQty(k) : '0')));
  const setVal = (i: number, v: string) => setVals(vals.map((x, j) => (j === i ? v : x)));

  const save = async () => {
    const entry = { ...preview, status: finalStatus };
    if (finalStatus === 'planned') {
      delete entry.portions;
      delete entry.items;
    }
    const ok = await saveDay(date, (d) => {
      d.meals[meal.id] = entry;
    });
    if (ok) {
      toast(`${meal.short}: ${STATUS_LABEL[finalStatus].toLowerCase()}`);
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

  const addGeneric = (kcal: number) => setExtras([...extras, { name: `Extra (+${kcal} kcal)`, kcal, p: 0, c: 0, f: 0 }]);
  const list = status === 'swapped' ? swaps : extras;
  const setList = status === 'swapped' ? setSwaps : setExtras;

  return (
    <Sheet title={`${meal.name} · ${scheduled}`} onClose={onClose}>
      <div className="stack">
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
            setPicker(s === 'swapped' && swaps.length === 0);
          }}
        />

        {(status === 'planned' || status === 'skipped' || status === 'swapped') && (
          <div className="card" style={{ padding: 12 }}>
            <div className="label" style={{ marginBottom: 6 }}>
              {mine.length ? 'Plano de hoje (com cortes)' : 'Plano'}
            </div>
            <div className="meal-items" style={{ margin: '0 0 8px' }}>
              {plate.items.map((it, i) => {
                const cut = mine.find((c) => c.food === it.food);
                const kcal = itemTotals(plan, it).kcal;
                return (
                  <div key={i} className="meal-item">
                    <span>
                      {itemLabel(plan, it)}
                      {cut && <div className="tiny warn-text">antes {meal.items[i].grams} g</div>}
                    </span>
                    <span className="num muted">{it.grams !== undefined ? `${it.grams} g` : ''}</span>
                    <span className="num">{kcal > 0 ? fmtInt(kcal) : ''}</span>
                  </div>
                );
              })}
            </div>
            <MacroChips t={plateTotals} />
          </div>
        )}

        {status === 'planned' && (
          <div className="hint">
            {mine.length
              ? `Comeu o prato de hoje, já com os cortes (−${fmtInt(-delta)} kcal).`
              : 'Comeu exatamente o plano. Saldo da refeição: zero.'}
          </div>
        )}

        {editing && (
          <div className="card" style={{ padding: 12 }}>
            <div className="label">Quanto você comeu de cada item</div>
            <div className="tiny muted" style={{ marginTop: 2 }}>
              Toque no nome para marcar que não comeu; ajuste as gramas se comeu mais ou menos.
            </div>
            <div className="chips wrap" style={{ margin: '10px 0 4px' }}>
              <span className="tiny muted" style={{ alignSelf: 'center' }}>
                Prato todo:
              </span>
              {PLATE_STEPS.map((x) => (
                <button key={x.k} className="chip" onClick={() => setAll(x.k)}>
                  {x.label}
                </button>
              ))}
            </div>
            <div className="portions">
              {plate.items.map((it, i) => {
                const kind = adjustable(it);
                const v = parseQty(vals[i] ?? '');
                const eaten = plateOf(meal, mine, kind === 'grams' ? [{ i, food: it.food, grams: v }] : kind === 'mult' ? [{ i, food: it.food, mult: v }] : []).items[i];
                const kcal = itemTotals(plan, eaten).kcal;
                const off = kind !== null && v === 0;
                const changed = kind !== null && Math.abs(v - defaults[i]) >= 0.001;
                return (
                  <div key={i} className={`portion-row ${off ? 'off' : ''}`}>
                    <button
                      className="portion-name"
                      disabled={!kind}
                      onClick={() => setVal(i, off ? fmtQty(defaults[i]) : '0')}
                      aria-label={off ? `Voltar ${itemLabel(plan, it)}` : `Não comi ${itemLabel(plan, it)}`}
                    >
                      <span>{itemLabel(plan, it)}</span>
                      <span className="tiny muted">
                        {off
                          ? 'não comeu · toque para voltar'
                          : changed
                            ? `previsto ${kind === 'grams' ? `${defaults[i]} g` : '1 porção'}`
                            : kind
                              ? 'como previsto'
                              : 'sem calorias'}
                      </span>
                    </button>
                    {kind === 'grams' && (
                      <label className="portion-qty">
                        <input
                          className="input"
                          inputMode="numeric"
                          value={vals[i]}
                          onChange={(e) => setVal(i, e.target.value.replace(/[^\d]/g, '').slice(0, 4))}
                          onFocus={(e) => e.target.select()}
                          aria-label={`Gramas de ${itemLabel(plan, it)}`}
                        />
                        <span>g</span>
                      </label>
                    )}
                    {kind === 'mult' && (
                      <div className="mini-seg">
                        {KCAL_STEPS.map((k) => (
                          <button key={k} className={Math.abs(v - k) < 0.001 ? 'on' : ''} onClick={() => setVal(i, fmtQty(k))}>
                            {k === 0.5 ? '½' : k === 1.5 ? '1½' : k}
                          </button>
                        ))}
                      </div>
                    )}
                    <span className="num portion-kcal">{kind ? fmtInt(kcal) : ''}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {status === 'skipped' && (
          <div className="hint warn">A refeição conta como 0 kcal. Pular refeições costuma virar fome e exagero depois; comer menos é melhor que pular.</div>
        )}

        {(editing || status === 'swapped') && (
          <div className="stack">
            <div className="label">{status === 'swapped' ? 'O que você comeu no lugar' : 'Fora do prato (bebida, sobremesa, outro alimento)'}</div>
            {status === 'more' && (
              <div className="chips wrap">
                {[100, 200, 300, 500].map((k) => (
                  <button key={k} className="chip" onClick={() => addGeneric(k)}>
                    +{k} kcal
                  </button>
                ))}
              </div>
            )}
            {list.length > 0 && (
              <div className="list">
                {list.map((it, i) => (
                  <div key={i} className="list-row">
                    <div className="grow">
                      <div className="ellipsis">{it.name}</div>
                      <div className="tiny dim">{it.grams ? `${it.grams} g` : it.qty ? `${fmtQty(it.qty)}×` : ''}</div>
                    </div>
                    <span className="num">{fmtInt(it.kcal)}</span>
                    <button className="icon-btn" onClick={() => setList(list.filter((_, j) => j !== i))} aria-label="Remover">
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {picker ? (
              <FoodPicker
                initialTab="presets"
                onAdd={(it) => {
                  setList([...list, it]);
                  setPicker(false);
                }}
              />
            ) : (
              <button className="btn block" onClick={() => setPicker(true)}>
                + Adicionar alimento ou bebida
              </button>
            )}
          </div>
        )}

        {eatsSomething && (
          <label className="field">
            <span>Horário em que comeu</span>
            <input className="input" type="time" value={time} onChange={(e) => e.target.value && setTime(e.target.value)} />
            {!isLast && Math.abs(shift) >= SHIFT_MIN && (
              <span className="tiny muted" style={{ marginTop: 4 }}>
                {Math.abs(shift)} min {shift > 0 ? 'depois' : 'antes'} do previsto ({meal.time}): as próximas refeições de hoje se ajustam.
              </span>
            )}
          </label>
        )}

        <label className="field">
          <span>Observação (opcional)</span>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex.: almoço fora, sem balança" />
        </label>

        <div className="card hot" style={{ padding: 12 }}>
          <div className="row between">
            <span className="label">Resultado{editing && finalStatus !== status ? ` · ${STATUS_LABEL[finalStatus].toLowerCase()}` : ''}</span>
            <Delta v={-delta} />
          </div>
          <div style={{ marginTop: 8 }}>
            <MacroChips t={preview} />
          </div>
          <div className="tiny muted" style={{ marginTop: 6 }}>
            {delta > 0
              ? 'Débito no banco de calorias.'
              : delta < 0 && finalStatus === 'planned' && mine.length
                ? 'Corte de hoje aplicado: é ele que fecha a meta ou paga a compensação.'
                : delta < 0
                  ? 'Crédito no banco de calorias.'
                  : 'Sem efeito no banco.'}
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
