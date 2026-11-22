import { foodIndex, foodTotals, round1, type Food } from './foods';
import type { LadderStep, MealId, ProtoItem, ProtoMeal, Protocol, SubstitutionRow, Totals } from './types';

export type PlanItem = ProtoItem;

/** Refeição já resolvida (com nome curto e descrição preenchidos). */
export interface Meal {
  id: MealId;
  name: string;
  short: string;
  time: string;
  hint: string;
  items: ProtoItem[];
}

/** Cardápio padrão do plano (2.250 kcal · ~197 g P · ~240 g C · ~56 g G). Pesos de alimentos prontos. */
export const DEFAULT_MEALS: ProtoMeal[] = [
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

/** Ordem de corte quando é preciso comer menos: preserva proteína e carboidrato do pré-treino. */
export const DEFAULT_LADDER: LadderStep[] = [
  { meal: 'lanche', food: 'pasta_amendoim', from: 15, to: 0 },
  { meal: 'almoco', food: 'azeite', from: 5, to: 0 },
  { meal: 'jantar', food: 'azeite', from: 5, to: 0 },
  { meal: 'almoco', food: 'arroz', from: 120, to: 60 },
  { meal: 'jantar', food: 'batata', from: 250, to: 130 },
  { meal: 'cafe', food: 'cuscuz', from: 130, to: 80 },
  { meal: 'lanche', food: 'aveia', from: 20, to: 0 },
  { meal: 'almoco', food: 'arroz', from: 60, to: 0 },
];

export const DEFAULT_SUBSTITUTIONS: { carbs: SubstitutionRow[]; proteins: SubstitutionRow[] } = {
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

const ZERO: Totals = { kcal: 0, p: 0, c: 0, f: 0 };
const add = (a: Totals, b: Totals): Totals => ({ kcal: a.kcal + b.kcal, p: a.p + b.p, c: a.c + b.c, f: a.f + b.f });

/** Calorias e macros de um item do cardápio. */
export function itemTotalsWith(foods: Record<string, Food>, it: ProtoItem): Totals {
  if (it.food && it.grams && foods[it.food]) return foodTotals(foods[it.food], it.grams);
  if (typeof it.kcal === 'number') return { kcal: it.kcal, p: it.p ?? 0, c: it.c ?? 0, f: it.f ?? 0 };
  return ZERO;
}

export function mealsTotalsWith(foods: Record<string, Food>, meals: ProtoMeal[]): Totals {
  return meals.reduce((acc, m) => m.items.reduce((a, it) => add(a, itemTotalsWith(foods, it)), acc), ZERO);
}

/** Totais do cardápio padrão (usado para as metas padrão). */
export const DEFAULT_TOTALS: Totals = mealsTotalsWith(foodIndex([]), DEFAULT_MEALS);

/** Protocolo já resolvido para uso nas telas e nos cálculos. */
export interface Plan {
  protocol: Protocol;
  meals: Meal[];
  mealById: Record<MealId, Meal>;
  foods: Record<string, Food>;
  totals: Totals;
  kcal: number;
}

const cache = new WeakMap<Protocol, Plan>();

export function planOf(protocol: Protocol): Plan {
  const hit = cache.get(protocol);
  if (hit) return hit;
  const foods = foodIndex(protocol.foods);
  const meals: Meal[] = [...protocol.meals]
    .sort((a, b) => a.time.localeCompare(b.time))
    .map((m) => ({ id: m.id, name: m.name, short: m.short || m.name.split(' ')[0], time: m.time, hint: m.hint ?? '', items: m.items }));
  const totals = mealsTotalsWith(foods, meals);
  const plan: Plan = {
    protocol,
    meals,
    mealById: Object.fromEntries(meals.map((m) => [m.id, m])),
    foods,
    totals,
    kcal: Math.round(totals.kcal),
  };
  cache.set(protocol, plan);
  return plan;
}

export function itemLabel(plan: Plan, it: ProtoItem): string {
  if (it.free) return it.free;
  if (it.label) return it.label;
  if (it.food && plan.foods[it.food]) return plan.foods[it.food].name;
  return it.food ?? 'Item';
}

export function itemTotals(plan: Plan, it: ProtoItem): Totals {
  return itemTotalsWith(plan.foods, it);
}

export function mealTotals(plan: Plan, meal: Meal): Totals {
  return meal.items.reduce((acc, it) => add(acc, itemTotals(plan, it)), ZERO);
}

export interface ReductionStep {
  meal: MealId;
  mealName: string;
  food: string;
  foodName: string;
  fromG: number;
  toG: number;
  kcal: number;
}

/**
 * Sugere cortes concretos (em gramas) para reduzir `kcal` do dia, seguindo a ordem de cortes do protocolo.
 * Cada passo corta no máximo (from − to) gramas e nunca deixa o item abaixo de `to`; as gramas mostradas
 * são as do prato real (o cardápio pode ter porções diferentes das da ordem de cortes).
 */
export function reductionPlan(plan: Plan, kcal: number): { steps: ReductionStep[]; total: number } {
  const steps: ReductionStep[] = [];
  let need = Math.max(0, kcal);
  const current: Record<string, number> = {};
  for (const step of plan.protocol.reductionLadder) {
    if (need <= 0.5) break;
    const meal = plan.mealById[step.meal];
    const item = meal?.items.find((i) => i.food === step.food && i.grams);
    const food = plan.foods[step.food];
    if (!meal || !item || !food || food.per100.kcal <= 0) continue;
    const key = `${step.meal}:${step.food}`;
    const cur = current[key] ?? item.grams!;
    const maxCut = Math.max(0, Math.min(step.from - step.to, cur - step.to));
    if (maxCut <= 0) continue;
    const kcalPerG = food.per100.kcal / 100;
    const gramsCut = maxCut * kcalPerG <= need ? maxCut : Math.min(maxCut, Math.ceil(need / kcalPerG / 5) * 5);
    const toG = cur - gramsCut;
    const cutKcal = gramsCut * kcalPerG;
    current[key] = toG;
    need -= cutKcal;
    const existing = steps.find((s) => s.meal === step.meal && s.food === step.food);
    if (existing) {
      existing.toG = toG;
      existing.kcal += cutKcal;
    } else {
      steps.push({ meal: step.meal, mealName: meal.name, food: step.food, foodName: food.name, fromG: item.grams!, toG, kcal: cutKcal });
    }
  }
  const total = steps.reduce((a, s) => a + s.kcal, 0);
  return { steps: steps.map((s) => ({ ...s, kcal: round1(s.kcal) })), total: round1(total) };
}
