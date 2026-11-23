import { plateOf } from '../lib/engine';
import { fmtInt } from '../lib/format';
import { itemLabel, itemTotals, type Meal, type Plan, type ReductionStep } from '../lib/plan';
import type { MealLog } from '../lib/types';

/**
 * Itens de uma refeição como previstos no cardápio, com o que mudou no dia:
 * cortes (compensação/meta), quantidades registradas e o que foi comido fora do prato.
 */
export function MealItems({
  plan,
  meal,
  cuts = [],
  log,
  cutLabel = 'Com corte',
}: {
  plan: Plan;
  meal: Meal;
  cuts?: ReductionStep[];
  log?: MealLog;
  cutLabel?: string;
}) {
  const edited = log?.status === 'more' || log?.status === 'less';
  const portions = edited ? (log?.portions ?? []) : [];
  const plate = plateOf(meal, cuts, portions);
  return (
    <div className="meal-items">
      {meal.items.map((it, i) => {
        const kcal = itemTotals(plan, it).kcal;
        const ate = plate.items[i];
        const logged = portions.some((x) => x.i === i);
        const multChanged = ate.grams === undefined && typeof it.kcal === 'number' && ate.kcal !== it.kcal;
        const changed = ate.grams !== it.grams || multChanged;
        const none = ate.grams !== undefined ? ate.grams === 0 : ate.kcal === 0;
        return (
          <div key={i} className="meal-item">
            <span>
              {itemLabel(plan, it)}
              {changed && (
                <div className={`tiny ${logged ? 'cyan' : 'warn-text'}`}>
                  {logged ? 'Comeu' : cutLabel}: {ate.grams !== undefined ? `${ate.grams} g` : `${fmtInt(ate.kcal ?? 0)} kcal`}
                  {none ? ' (não comeu)' : ''}
                </div>
              )}
            </span>
            <span className="num muted">{it.grams ? `${it.grams} g` : ''}</span>
            <span className="num">{kcal > 0 ? fmtInt(kcal) : ''}</span>
          </div>
        );
      })}
      {edited &&
        log?.items?.map((x, j) => (
          <div key={`x${j}`} className="meal-item extra">
            <span>+ {x.name}</span>
            <span className="num muted">{x.grams ? `${x.grams} g` : ''}</span>
            <span className="num">{fmtInt(x.kcal)}</span>
          </div>
        ))}
      {log?.status === 'swapped' && (
        <div className="hint" style={{ marginTop: 8 }}>
          Comeu no lugar: {log.items?.length ? log.items.map((x) => `${x.name} (${fmtInt(x.kcal)} kcal)`).join(', ') : 'nada registrado'}
        </div>
      )}
    </div>
  );
}
