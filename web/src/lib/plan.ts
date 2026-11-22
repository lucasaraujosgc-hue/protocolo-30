import { FOOD_BY_ID, foodTotals, round1 } from './foods';
import type { MealId, Totals } from './types';

export interface PlanItem {
  food?: string;
  grams?: number;
  label?: string;
  free?: string;
}

export interface Meal {
  id: MealId;
  name: string;
  short: string;
  time: string;
  hint: string;
  items: PlanItem[];
}

/** Cardápio do plano (2.250 kcal · ~197 g P · ~241 g C · ~56 g G). Pesos de alimentos prontos. */
export const MEALS: Meal[] = [
  {
    id: 'cafe',
    name: 'Café da manhã',
    short: 'Café',
    time: '06:15',
    hint: 'Reposição pós-spinning',
    items: [
      { food: 'ovo', grams: 150, label: 'Ovos inteiros (3 un.)' },
      { food: 'clara', grams: 60, label: 'Claras (2 un.)' },
      { food: 'cuscuz', grams: 130 },
      { food: 'mamao', grams: 150 },
      { free: 'Café sem açúcar' },
    ],
  },
  {
    id: 'lanche',
    name: 'Lanche',
    short: 'Lanche',
    time: '10:00',
    hint: 'Proteína no meio da manhã',
    items: [
      { food: 'iogurte', grams: 170 },
      { food: 'whey', grams: 30 },
      { food: 'aveia', grams: 20 },
      { food: 'pasta_amendoim', grams: 15 },
    ],
  },
  {
    id: 'almoco',
    name: 'Almoço',
    short: 'Almoço',
    time: '13:00',
    hint: 'Prato completo',
    items: [
      { food: 'frango', grams: 150 },
      { food: 'arroz', grams: 120 },
      { food: 'feijao', grams: 100, label: 'Feijão carioca cozido (com caldo)' },
      { food: 'salada', grams: 150 },
      { food: 'legumes', grams: 100 },
      { food: 'azeite', grams: 5 },
    ],
  },
  {
    id: 'pre',
    name: 'Pré-treino',
    short: 'Pré',
    time: '16:00',
    hint: 'Carboidrato fácil, pouca gordura',
    items: [
      { food: 'banana', grams: 100, label: 'Banana prata (1 média, sem casca)' },
      { food: 'aveia', grams: 30 },
      { food: 'iogurte', grams: 170 },
    ],
  },
  {
    id: 'jantar',
    name: 'Jantar pós-treino',
    short: 'Jantar',
    time: '18:45',
    hint: 'Recuperação da musculação',
    items: [
      { food: 'patinho', grams: 140 },
      { food: 'batata', grams: 250 },
      { food: 'feijao', grams: 80 },
      { food: 'legumes', grams: 150 },
      { food: 'azeite', grams: 5 },
    ],
  },
];

export const MEAL_BY_ID: Record<MealId, Meal> = Object.fromEntries(MEALS.map((m) => [m.id, m])) as Record<MealId, Meal>;

export function itemLabel(it: PlanItem): string {
  if (it.free) return it.free;
  return it.label ?? FOOD_BY_ID[it.food!].name;
}

export function itemTotals(it: PlanItem): Totals {
  if (!it.food || !it.grams) return { kcal: 0, p: 0, c: 0, f: 0 };
  return foodTotals(FOOD_BY_ID[it.food], it.grams);
}

export function mealTotals(meal: Meal): Totals {
  return meal.items.reduce(
    (acc, it) => {
      const t = itemTotals(it);
      return { kcal: acc.kcal + t.kcal, p: acc.p + t.p, c: acc.c + t.c, f: acc.f + t.f };
    },
    { kcal: 0, p: 0, c: 0, f: 0 },
  );
}

export const PLAN_TOTALS: Totals = MEALS.reduce(
  (acc, m) => {
    const t = mealTotals(m);
    return { kcal: acc.kcal + t.kcal, p: acc.p + t.p, c: acc.c + t.c, f: acc.f + t.f };
  },
  { kcal: 0, p: 0, c: 0, f: 0 },
);

export const PLAN_KCAL = Math.round(PLAN_TOTALS.kcal);

/** Ordem de corte quando é preciso comer menos: preserva proteína e carboidrato do pré-treino. */
export const REDUCTION_LADDER: { meal: MealId; food: string; from: number; to: number }[] = [
  { meal: 'lanche', food: 'pasta_amendoim', from: 15, to: 0 },
  { meal: 'almoco', food: 'azeite', from: 5, to: 0 },
  { meal: 'jantar', food: 'azeite', from: 5, to: 0 },
  { meal: 'almoco', food: 'arroz', from: 120, to: 60 },
  { meal: 'jantar', food: 'batata', from: 250, to: 130 },
  { meal: 'cafe', food: 'cuscuz', from: 130, to: 80 },
  { meal: 'lanche', food: 'aveia', from: 20, to: 0 },
  { meal: 'almoco', food: 'arroz', from: 60, to: 0 },
];

export interface ReductionStep {
  meal: MealId;
  mealName: string;
  food: string;
  foodName: string;
  fromG: number;
  toG: number;
  kcal: number;
}

/** Sugere cortes concretos (em gramas) para reduzir `kcal` do dia. */
export function reductionPlan(kcal: number): { steps: ReductionStep[]; total: number } {
  const steps: ReductionStep[] = [];
  let need = Math.max(0, kcal);
  // Gramas já cortadas por (refeição, alimento) para encadear degraus do mesmo alimento.
  const current: Record<string, number> = {};
  for (const step of REDUCTION_LADDER) {
    if (need <= 0.5) break;
    const food = FOOD_BY_ID[step.food];
    const key = `${step.meal}:${step.food}`;
    const start = current[key] ?? step.from;
    const kcalPerG = food.per100.kcal / 100;
    const available = (start - step.to) * kcalPerG;
    if (available <= 0) continue;
    let gramsCut: number;
    if (available <= need) {
      gramsCut = start - step.to;
    } else {
      gramsCut = Math.min(start - step.to, Math.ceil(need / kcalPerG / 5) * 5);
    }
    const toG = start - gramsCut;
    const cutKcal = gramsCut * kcalPerG;
    current[key] = toG;
    need -= cutKcal;
    const existing = steps.find((s) => s.meal === step.meal && s.food === step.food);
    if (existing) {
      existing.toG = toG;
      existing.kcal += cutKcal;
    } else {
      steps.push({
        meal: step.meal,
        mealName: MEAL_BY_ID[step.meal].name,
        food: step.food,
        foodName: FOOD_BY_ID[step.food].name,
        fromG: start,
        toG,
        kcal: cutKcal,
      });
    }
  }
  const total = steps.reduce((a, s) => a + s.kcal, 0);
  return { steps: steps.map((s) => ({ ...s, kcal: round1(s.kcal) })), total: round1(total) };
}

export const SUBSTITUTIONS = {
  carbs: [
    { food: 'Arroz branco cozido', qty: '105 g', kcal: 135 },
    { food: 'Batata inglesa cozida', qty: '250 g', kcal: 130 },
    { food: 'Mandioca cozida', qty: '100 g', kcal: 125 },
    { food: 'Cuscuz de milho cozido', qty: '120 g', kcal: 135 },
    { food: 'Aveia em flocos', qty: '45 g', kcal: 175 },
    { food: 'Banana prata', qty: '115 g', kcal: 115 },
    { food: 'Pão francês', qty: '50 g (1 un.)', kcal: 150 },
    { food: 'Maçã', qty: '200 g', kcal: 110 },
    { food: 'Feijão carioca cozido', qty: '220 g', kcal: 170 },
  ],
  proteins: [
    { food: 'Peito de frango grelhado', qty: '95 g', kcal: 150 },
    { food: 'Patinho grelhado', qty: '85 g', kcal: 185 },
    { food: 'Tilápia grelhada', qty: '115 g', kcal: 145 },
    { food: 'Whey concentrado', qty: '38 g', kcal: 150 },
    { food: 'Ovos inteiros', qty: '4–5 un. (225 g)', kcal: 330 },
  ],
};
