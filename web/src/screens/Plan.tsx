import { Check, ChevronDown, Pencil, Pizza, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ExtraSheet, MealLogSheet, STATUS_CHIP, STATUS_LABEL } from '../components/MealSheets';
import { DateNav, Delta, MacroChips } from '../components/ui';
import { compensationToday, dayCuts, evalDay, makeMealLog, mealWithCuts, type MealEval } from '../lib/engine';
import { fmt1, fmtInt } from '../lib/format';
import { itemLabel, itemTotals, type Plan as PlanT, type ReductionStep } from '../lib/plan';
import { useStore } from '../lib/store';

export function Plan() {
  const { state, today, nowMin, samples, bank, saveDay, toast } = useStore();
  const [date, setDate] = useState(today);
  const [open, setOpen] = useState<string | null>(null);
  const [sheet, setSheet] = useState<{ t: 'meal'; i: number } | { t: 'extra' } | null>(null);
  const ev = useMemo(() => evalDay(state, date, { today, nowMin, samples }), [state, date, today, nowMin, samples]);
  const comp = date === today ? compensationToday(state, today, bank.projected) : null;
  const cuts = dayCuts(ev, comp);
  const compFood = cuts.compFood;
  const planGap = cuts.planGap;
  const cut = cuts.kcal;
  const subs = ev.protocol.substitutions;
  const total = ev.actual;
  const pct = (g: number, k: number) => (total.kcal > 0 ? ((g * k) / total.kcal) * 100 : 0);

  return (
    <div className="screen">
      <DateNav date={date} today={today} onChange={setDate} />

      <div className="card glow">
        <div className="row between">
          <span className="label">{ev.isFuture ? 'Total do dia (plano)' : ev.isToday ? 'Previsto para hoje' : 'Total do dia'}</span>
          {!ev.isFuture && ev.inProtocol && (
            <span className="small">
              Saldo comida <Delta v={ev.foodDev} />
            </span>
          )}
        </div>
        <div className="row" style={{ alignItems: 'baseline', gap: 8, marginTop: 6 }}>
          <span className="big-num">{fmtInt(total.kcal)}</span>
          <span className="muted small">/ {fmtInt(ev.target.kcal - compFood)} kcal</span>
        </div>
        {ev.isToday && (
          <div className="tiny muted" style={{ marginTop: 2 }}>
            Registrado até agora: {fmtInt(ev.consumed.kcal)} kcal. O restante considera o cardápio.
          </div>
        )}
        <div className="grid2" style={{ gridTemplateColumns: 'repeat(3, 1fr)', margin: '12px 0' }}>
          <div className="stat">
            <span className="label">Proteína</span>
            <span className="v num" style={{ color: 'var(--p)' }}>
              {fmtInt(total.p)}
              <small>/ {ev.target.p} g</small>
            </span>
          </div>
          <div className="stat">
            <span className="label">Carbo</span>
            <span className="v num" style={{ color: 'var(--c)' }}>
              {fmtInt(total.c)}
              <small>/ {ev.target.c} g</small>
            </span>
          </div>
          <div className="stat">
            <span className="label">Gordura</span>
            <span className="v num" style={{ color: 'var(--f)' }}>
              {fmtInt(total.f)}
              <small>/ {ev.target.f} g</small>
            </span>
          </div>
        </div>
        <div className="split">
          <i style={{ width: `${pct(total.p, 4)}%` }} />
          <i style={{ width: `${pct(total.c, 4)}%` }} />
          <i style={{ width: `${pct(total.f, 9)}%` }} />
        </div>
        <div className="row between tiny muted" style={{ marginTop: 6 }}>
          <span>P {Math.round(pct(total.p, 4))}%</span>
          <span>C {Math.round(pct(total.c, 4))}%</span>
          <span>G {Math.round(pct(total.f, 9))}%</span>
        </div>
        {ev.flags.includes('proteina_baixa') && (
          <div className="hint warn" style={{ marginTop: 10 }}>
            Proteína abaixo de {fmtInt(ev.target.p * 0.75)} g neste dia. Para preservar músculo, complete com whey, ovos ou frango.
          </div>
        )}
        {ev.flags.includes('comeu_pouco') && <div className="hint warn" style={{ marginTop: 10 }}>Você comeu bem abaixo do piso. Um dia assim não faz mal, mas repetido custa massa muscular.</div>}
      </div>

      {cut > 0 && (
        <div className="card warn">
          <div className="card-title">
            <h3>Ajustes {date === today ? 'de hoje' : 'do dia'} · −{fmtInt(cut)} kcal</h3>
          </div>
          <div className="list">
            {cuts.steps.map((r) => (
              <div key={`${r.meal}${r.food}`} className="list-row">
                <div className="grow">
                  <div>
                    {r.mealName} · {r.foodName}
                  </div>
                  <div className="tiny muted num">
                    {r.fromG} g → {r.toG} g
                  </div>
                </div>
                <span className="num neg">−{fmtInt(r.kcal)}</span>
              </div>
            ))}
          </div>
          <div className="tiny muted" style={{ marginTop: 6 }}>
            {compFood > 0 ? 'Corte da compensação ativa. ' : ''}
            {planGap > 0 ? `A meta desta versão (${fmtInt(ev.target.kcal)} kcal) está abaixo do cardápio (${fmtInt(ev.plan.kcal)} kcal). ` : ''}
            Ao tocar em “Segui”, a refeição é registrada já com o corte.
          </div>
          {cuts.uncovered > 0 && (
            <div className="hint warn" style={{ marginTop: 8 }}>
              A ordem de cortes do protocolo não cobre {fmtInt(cuts.uncovered)} kcal. Registre como “A menos” ou ajuste o protocolo.
            </div>
          )}
        </div>
      )}

      {ev.meals.map((me, i) => (
        <MealCard
          key={me.meal.id}
          me={me}
          plan={ev.plan}
          cuts={cuts.steps}
          open={open === me.meal.id}
          onToggle={() => setOpen(open === me.meal.id ? null : me.meal.id)}
          onLog={() => setSheet({ t: 'meal', i })}
          onQuick={async () => {
            const ok = await saveDay(date, (d) => {
              d.meals[me.meal.id] = makeMealLog(ev.plan, me.meal, 'planned', { cuts: cuts.steps });
            });
            if (ok) toast(`${me.meal.short} conforme o plano`);
          }}
        />
      ))}

      {ev.orphanMeals.length > 0 && (
        <div className="card warn">
          <div className="card-title">
            <h3>Registros fora do cardápio desta versão</h3>
          </div>
          <div className="tiny muted" style={{ marginBottom: 8 }}>
            O protocolo deste dia mudou depois destes registros. Eles continuam contando no total; apague se estiverem duplicados.
          </div>
          <div className="list">
            {ev.orphanMeals.map((o) => (
              <div key={o.id} className="list-row">
                <div className="grow">
                  <div className="ellipsis">Refeição “{o.id}”</div>
                  <div className="tiny dim">{STATUS_LABEL[o.log.status]}</div>
                </div>
                <span className="num">{fmtInt(o.log.kcal)}</span>
                <button
                  className="icon-btn"
                  aria-label="Apagar"
                  onClick={() =>
                    saveDay(date, (d) => {
                      delete d.meals[o.id];
                    })
                  }
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-title">
          <h3>Fora do plano</h3>
          <button className="btn sm" onClick={() => setSheet({ t: 'extra' })}>
            <Pizza size={15} /> Adicionar
          </button>
        </div>
        {state.days[date]?.extras.length ? (
          <div className="list">
            {state.days[date].extras.map((x) => (
              <div key={x.id} className="list-row">
                <div className="grow">
                  <div className="ellipsis">{x.name}</div>
                  <div className="tiny dim">
                    P {fmt1(x.p)} · C {fmt1(x.c)} · G {fmt1(x.f)}
                  </div>
                </div>
                <span className="num">{fmtInt(x.kcal)}</span>
                <button
                  className="icon-btn"
                  aria-label="Apagar"
                  onClick={() =>
                    saveDay(date, (d) => {
                      d.extras = d.extras.filter((e) => e.id !== x.id);
                    })
                  }
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="muted small">Nada fora do plano neste dia.</div>
        )}
      </div>

      <details className="card">
        <summary className="row between">
          <h3 style={{ margin: 0, fontSize: 15 }}>Substituições equivalentes</h3>
          <ChevronDown size={18} className="muted" />
        </summary>
        <div style={{ marginTop: 12 }}>
          <div className="label">Carboidratos · cada linha ≈ 30 g</div>
          <table className="table" style={{ marginTop: 6 }}>
            <tbody>
              {subs.carbs.map((s) => (
                <tr key={s.food}>
                  <td>{s.food}</td>
                  <td className="num">{s.qty}</td>
                  <td className="num r">{s.kcal}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="label" style={{ marginTop: 14 }}>
            Proteínas · cada linha ≈ 30 g
          </div>
          <table className="table" style={{ marginTop: 6 }}>
            <tbody>
              {subs.proteins.map((s) => (
                <tr key={s.food}>
                  <td>{s.food}</td>
                  <td className="num">{s.qty}</td>
                  <td className="num r">{s.kcal}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      {sheet?.t === 'meal' && (
        <MealLogSheet date={date} plan={ev.plan} meal={ev.meals[sheet.i].meal} log={ev.meals[sheet.i].log} cuts={cuts.steps} onClose={() => setSheet(null)} />
      )}
      {sheet?.t === 'extra' && <ExtraSheet date={date} onClose={() => setSheet(null)} />}
    </div>
  );
}

function MealCard({
  me,
  plan,
  cuts,
  open,
  onToggle,
  onLog,
  onQuick,
}: {
  me: MealEval;
  plan: PlanT;
  cuts: ReductionStep[];
  open: boolean;
  onToggle: () => void;
  onLog: () => void;
  onQuick: () => void;
}) {
  const status = me.log?.status;
  const plate = mealWithCuts(me.meal, cuts);
  return (
    <div className={`card ${status && status !== 'planned' ? (status === 'more' ? 'warn' : '') : ''}`}>
      <button className="row between" style={{ width: '100%', textAlign: 'left' }} onClick={onToggle}>
        <div>
          <div className="tiny muted num">{me.meal.time}</div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{me.meal.name}</div>
        </div>
        <div className="row" style={{ gap: 8 }}>
          {status ? (
            <span className={`chip ${STATUS_CHIP[status]}`}>{STATUS_LABEL[status]}</span>
          ) : me.passed ? (
            <span className="chip">Sem registro</span>
          ) : null}
          <span className="num">{fmtInt(me.actual.kcal)}</span>
          <ChevronDown size={18} className="muted" style={{ transform: open ? 'rotate(180deg)' : undefined, transition: 'transform .2s' }} />
        </div>
      </button>
      {open && (
        <>
          <div className="meal-items">
            {me.meal.items.map((it, i) => {
              const kcal = itemTotals(plan, it).kcal;
              const today = plate.items[i];
              return (
                <div key={i} className="meal-item">
                  <span>
                    {itemLabel(plan, it)}
                    {today.grams !== it.grams && <div className="tiny warn-text">Com corte: {today.grams} g</div>}
                  </span>
                  <span className="num muted">{it.grams ? `${it.grams} g` : ''}</span>
                  <span className="num">{kcal > 0 ? fmtInt(kcal) : ''}</span>
                </div>
              );
            })}
          </div>
          {me.log?.items?.length ? (
            <div className="hint" style={{ marginBottom: 10 }}>
              {status === 'swapped' ? 'Comeu no lugar: ' : 'A mais: '}
              {me.log.items.map((x) => `${x.name} (${fmtInt(x.kcal)} kcal)`).join(', ')}
            </div>
          ) : null}
          {me.log?.note && <div className="tiny muted" style={{ marginBottom: 8 }}>“{me.log.note}”</div>}
          <MacroChips t={me.actual} />
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn sm" onClick={onQuick}>
              <Check size={15} /> Segui
            </button>
            <button className="btn sm" onClick={onLog}>
              <Pencil size={14} /> Registrar diferença
            </button>
          </div>
        </>
      )}
    </div>
  );
}
