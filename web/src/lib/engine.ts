import { addDays, diffDays, minutesOf, rangeDates } from './dates';
import { sumItems } from './foods';
import { mealTotals, planOf, reductionPlan, type Meal, type Plan, type ReductionStep } from './plan';
import { protocolFor, sortProtocols } from './protocol';
import { plannedSessions, type PlannedSession } from './schedule';
import type {
  AppState,
  CompMode,
  DailyTargets,
  DayLog,
  ExerciseLog,
  LogItem,
  MealId,
  MealLog,
  MealStatus,
  Measurement,
  MeasureKey,
  Profile,
  Protocol,
  SpinTemplate,
  TargetKey,
  Totals,
} from './types';
import { SPIN_KEYS, TARGET_KEYS } from './types';

/* ------------------------------------------------------------------ básicos */

export const ZERO: Totals = { kcal: 0, p: 0, c: 0, f: 0 };
export const addT = (a: Totals, b: Totals): Totals => ({ kcal: a.kcal + b.kcal, p: a.p + b.p, c: a.c + b.c, f: a.f + b.f });
export const scaleT = (a: Totals, k: number): Totals => ({ kcal: a.kcal * k, p: a.p * k, c: a.c * k, f: a.f * k });
/** Arredonda para 0,1 (kcal inclusive): somar refeições registradas dá exatamente o total do cardápio. */
export const roundT = (a: Totals): Totals => ({
  kcal: Math.round(a.kcal * 10) / 10,
  p: Math.round(a.p * 10) / 10,
  c: Math.round(a.c * 10) / 10,
  f: Math.round(a.f * 10) / 10,
});
const totalsOf = (t: Totals): Totals => ({ kcal: t.kcal, p: t.p, c: t.c, f: t.f });

export const emptyDay = (): DayLog => ({ meals: {}, extras: [], exercises: [] });
export const getDay = (state: AppState, date: string): DayLog => state.days[date] ?? emptyDay();

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Versão do protocolo em vigor numa data. */
export const protoAt = (state: AppState, date: string): Protocol => protocolFor(state.protocols, date);
/** Cardápio/metas resolvidos da versão em vigor numa data. */
export const planAt = (state: AppState, date: string): Plan => planOf(protoAt(state, date));

/* ---------------------------------------------------------- registro refeição */

/** A refeição com os cortes do dia aplicados (gramas reduzidas). */
export function mealWithCuts(meal: Meal, cuts: ReductionStep[] = []): Meal {
  const mine = cuts.filter((c) => c.meal === meal.id);
  if (!mine.length) return meal;
  const done = new Set<string>();
  return {
    ...meal,
    items: meal.items.map((it) => {
      // O corte vale para o primeiro item daquele alimento na refeição (o mesmo que a ordem de cortes usou).
      const c = mine.find((x) => x.food === it.food);
      if (!c || !it.grams || done.has(c.food)) return it;
      done.add(c.food);
      return { ...it, grams: Math.max(0, c.toG) };
    }),
  };
}

export function makeMealLog(
  plan: Plan,
  meal: Meal,
  status: MealStatus,
  opts: { items?: LogItem[]; fraction?: number; note?: string; cuts?: ReductionStep[] } = {},
): MealLog {
  // "Segui" com cortes do dia (compensação ou meta abaixo do cardápio) registra o prato reduzido.
  const planned = mealTotals(plan, mealWithCuts(meal, opts.cuts));
  let t: Totals = planned;
  let items: LogItem[] | undefined;
  let fraction: number | undefined;
  if (status === 'more') {
    items = opts.items ?? [];
    t = addT(planned, sumItems(items));
  } else if (status === 'less') {
    fraction = Math.min(1, Math.max(0, opts.fraction ?? 0.5));
    t = scaleT(planned, fraction);
  } else if (status === 'skipped') {
    t = ZERO;
  } else if (status === 'swapped') {
    items = opts.items ?? [];
    t = sumItems(items);
  }
  const r = roundT(t);
  return { status, ...r, items, fraction, note: opts.note || undefined, at: new Date().toISOString() };
}

/* ------------------------------------------------------- metas de exercício */

export function targetKeyOf(ex: Pick<ExerciseLog, 'kind' | 'template'>): TargetKey {
  if (ex.kind === 'spinning') return ex.template ?? 'livre';
  if (ex.kind === 'musculacao') return 'musculacao';
  return 'outro';
}

/** Sem calorias do relógio, "fiz parte" conta como esta fração da meta da sessão. */
export const PARTIAL_SHARE = 0.5;

export interface TargetInfo {
  value: number;
  manual: number;
  calibrated: boolean;
  samples: number;
}

/** Amostras de calorias ativas por tipo de treino, separadas pela "assinatura" da sessão no protocolo. */
export type Samples = Record<string, number[]>;

/**
 * A calibração recomeça quando uma versão do protocolo muda a sessão ou a meta manual daquele tipo
 * (ex.: um Z2 de 45 min não herda as calorias do Z2 de 30 min).
 */
function sigOf(p: Protocol, k: TargetKey): string {
  const sess = (SPIN_KEYS as string[]).includes(k) ? p.training.sessions[k as SpinTemplate] : null;
  return `${k}|${p.training.exerciseTargets[k]}|${sess ? JSON.stringify(sess.blocks) : ''}`;
}

export function calibrationSamples(state: AppState): Samples {
  const out: Samples = {};
  const versions = sortProtocols(state.protocols);
  const dates = Object.keys(state.days)
    .filter((d) => d >= state.settings.startDate)
    .sort();
  for (const d of dates) {
    let p = versions[0];
    for (const v of versions) if (v.from <= d) p = v;
    for (const ex of state.days[d].exercises) {
      if (ex.status !== 'done' || !ex.activeKcal || ex.activeKcal <= 0) continue;
      const key = sigOf(p, targetKeyOf(ex));
      (out[key] ??= []).push(ex.activeKcal);
    }
  }
  return out;
}

/** Meta de calorias ativas por tipo de treino; com calibração, vira a mediana das 3 primeiras sessões. */
export function exerciseTargets(protocol: Protocol, samples: Samples): Record<TargetKey, TargetInfo> {
  const out = {} as Record<TargetKey, TargetInfo>;
  for (const k of TARGET_KEYS) {
    const manual = protocol.training.exerciseTargets[k];
    const list = samples[sigOf(protocol, k)] ?? [];
    const first = list.slice(0, 3);
    const calibrated = protocol.bank.autoCalibrate && first.length >= 3;
    out[k] = { value: calibrated ? Math.round(median(first)) : manual, manual, calibrated, samples: list.length };
  }
  return out;
}

/* ----------------------------------------------------------------- peso/gasto */

function byDateTime(a: Measurement, b: Measurement) {
  return (a.date + a.time).localeCompare(b.date + b.time);
}

export function sortedMeasurements(ms: Measurement[]): Measurement[] {
  return [...ms].sort(byDateTime);
}

export function currentWeight(state: AppState, date: string, fallback = 100): number {
  const ms = sortedMeasurements(state.measurements).filter((m) => m.weight && m.date <= date);
  const fasting = ms.filter((m) => m.fasting);
  const pick = (fasting.length ? fasting : ms).at(-1);
  return pick?.weight ?? fallback;
}

/** kcal ativas por passo (caminhada ~5 km/h, ~1.300 passos/km, custo líquido ~0,5 kcal/kg/km). */
export const kcalPerStep = (w: number) => (0.5 * w) / 1300;
/** kcal ativas por minuto de caminhada rápida (~3,5 MET). */
export const walkKcalPerMin = (w: number) => (2.5 * w) / 60;

/* ------------------------------------------------------------- avaliação dia */

export type SessionState = 'done' | 'partial' | 'missed' | 'pending';

export interface SessionEval {
  planned: PlannedSession;
  log?: ExerciseLog;
  target: number;
  dev: number;
  state: SessionState;
}

export interface MealEval {
  meal: Meal;
  planned: Totals;
  actual: Totals;
  log?: MealLog;
  passed: boolean;
  consumed: boolean;
}

export interface DayEval {
  date: string;
  dayNumber: number;
  inProtocol: boolean;
  isToday: boolean;
  isPast: boolean;
  isFuture: boolean;
  protocol: Protocol;
  plan: Plan;
  target: DailyTargets;
  meals: MealEval[];
  /** Registros de refeições que não existem no cardápio desta versão (ex.: cardápio trocado no mesmo dia). */
  orphanMeals: { id: MealId; log: MealLog }[];
  extras: Totals;
  planned: Totals;
  actual: Totals;
  consumed: Totals;
  foodDev: number;
  sessions: SessionEval[];
  extraSessions: { log: ExerciseLog; dev: number }[];
  exDevRaw: number;
  exDevAdj: number;
  creditFactor: number;
  steps?: number;
  stepsTarget: number;
  stepsDevRaw: number;
  stepsDevAdj: number;
  absorbed: number;
  balance: number;
  pendingMeals: MealId[];
  pendingSessions: number;
  flags: string[];
}

export interface EvalOpts {
  today: string;
  nowMin: number;
  samples?: Samples;
}

export function evalDay(state: AppState, date: string, opts: EvalOpts): DayEval {
  const protocol = protoAt(state, date);
  const plan = planOf(protocol);
  const cf = protocol.bank.creditFactor;
  const adj = (x: number) => (x > 0 ? x * cf : x);
  const targets = exerciseTargets(protocol, opts.samples ?? calibrationSamples(state));
  const day = getDay(state, date);
  const dayNumber = diffDays(date, state.settings.startDate) + 1;
  const isToday = date === opts.today;
  const isPast = date < opts.today;
  const isFuture = date > opts.today;
  const target = protocol.targets;

  const meals: MealEval[] = plan.meals.map((meal) => {
    const planned = mealTotals(plan, meal);
    const log = day.meals[meal.id];
    const actual = log ? totalsOf(log) : planned;
    const passed = isPast || (isToday && minutesOf(meal.time) <= opts.nowMin);
    return { meal, planned, actual, log, passed, consumed: !!log || passed };
  });
  const orphanMeals = Object.entries(day.meals)
    .filter(([id]) => !plan.mealById[id])
    .map(([id, log]) => ({ id, log }));
  const orphanT = orphanMeals.reduce((acc, o) => addT(acc, totalsOf(o.log)), ZERO);
  const extras = day.extras.reduce((acc, e) => addT(acc, totalsOf(e)), ZERO);
  const planned = meals.reduce((acc, m) => addT(acc, m.planned), ZERO);
  const actual = addT(
    meals.reduce((acc, m) => addT(acc, m.actual), ZERO),
    addT(extras, orphanT),
  );
  const consumed = isFuture
    ? addT(extras, orphanT)
    : addT(
        meals.filter((m) => m.consumed).reduce((acc, m) => addT(acc, m.actual), ZERO),
        addT(extras, orphanT),
      );
  const foodDev = isFuture ? 0 : target.kcal - Math.round(actual.kcal);

  const plannedList = plannedSessions(protocol.training, state.settings.startDate, date);
  const used = new Set<string>();
  const sessions: SessionEval[] = plannedList.map((p) => {
    const log = day.exercises.find((e) => e.plannedKey === p.key && !used.has(e.id));
    if (log) used.add(log.id);
    const t = targets[p.targetKey].value;
    if (!log) return { planned: p, target: t, dev: 0, state: 'pending' as SessionState };
    if (log.status === 'missed') return { planned: p, log, target: t, dev: -t, state: 'missed' as SessionState };
    const active = log.activeKcal ?? (log.status === 'partial' ? t * PARTIAL_SHARE : t);
    return { planned: p, log, target: t, dev: active - t, state: log.status as SessionState };
  });
  const extraSessions = day.exercises
    .filter((e) => !used.has(e.id) && e.status !== 'missed')
    .map((log) => ({ log, dev: log.activeKcal ?? 0 }));
  const exDevRaw = isFuture ? 0 : sessions.reduce((a, x) => a + x.dev, 0) + extraSessions.reduce((a, x) => a + x.dev, 0);
  const exDevAdj = isFuture
    ? 0
    : sessions.reduce((a, x) => a + adj(x.dev), 0) + extraSessions.reduce((a, x) => a + adj(x.dev), 0);

  const steps = day.steps;
  const stepsTarget = target.steps;
  let stepsDevRaw = 0;
  if (steps !== undefined && !isFuture) {
    const w = currentWeight(state, date);
    stepsDevRaw = (steps - stepsTarget) * kcalPerStep(w);
    // Hoje, a falta de passos ainda pode ser recuperada: só conta crédito.
    if (isToday && stepsDevRaw < 0) stepsDevRaw = 0;
  }
  const stepsDevAdj = adj(stepsDevRaw);

  const absorbed = day.absorbed ?? 0;
  const balance = dayNumber >= 1 && !isFuture ? foodDev + exDevAdj + stepsDevAdj + absorbed : 0;
  const pendingMeals = meals.filter((m) => m.passed && !m.log).map((m) => m.meal.id);
  const pendingSessions = sessions.filter((x) => x.state === 'pending' && (isPast || isToday)).length;

  const flags: string[] = [];
  const changedMeals = meals.some((m) => m.log && m.log.status !== 'planned') || orphanMeals.length > 0;
  if (!isFuture && changedMeals && actual.kcal < protocol.bank.foodFloor - 250) flags.push('comeu_pouco');
  if (!isFuture && changedMeals && actual.p < target.p * 0.75) flags.push('proteina_baixa');

  return {
    date,
    dayNumber,
    inProtocol: dayNumber >= 1,
    isToday,
    isPast,
    isFuture,
    protocol,
    plan,
    target,
    meals,
    orphanMeals,
    extras,
    planned,
    actual,
    consumed,
    foodDev,
    sessions,
    extraSessions,
    exDevRaw,
    exDevAdj,
    creditFactor: cf,
    steps,
    stepsTarget,
    stepsDevRaw,
    stepsDevAdj,
    absorbed,
    balance,
    pendingMeals,
    pendingSessions,
    flags,
  };
}

/* ------------------------------------------------------------------- banco */

export interface BankRow {
  date: string;
  ev: DayEval;
  cumulative: number;
}

export interface BankSummary {
  rows: BankRow[];
  closed: number;
  today: DayEval;
  projected: number;
}

export function bankSummary(state: AppState, opts: EvalOpts): BankSummary {
  const o = { ...opts, samples: opts.samples ?? calibrationSamples(state) };
  const start = state.settings.startDate;
  const yesterday = addDays(opts.today, -1);
  const rows: BankRow[] = [];
  let cum = 0;
  for (const d of rangeDates(start, yesterday)) {
    const ev = evalDay(state, d, o);
    cum += ev.balance;
    rows.push({ date: d, ev, cumulative: cum });
  }
  const today = evalDay(state, opts.today, o);
  return { rows, closed: cum, today, projected: cum + today.balance };
}

/* ------------------------------------------------------------- compensação */

export interface CompInput {
  debt: number;
  mode: CompMode;
  days: number;
  foodShare: number;
  plan: Plan;
  weightKg: number;
  z2PerMin: number;
}

export interface CompResult {
  debt: number;
  daysRequested: number;
  daysUsed: number;
  minDays: number;
  perDayFood: number;
  perDayActive: number;
  perDayEffective: number;
  absorbed: number;
  absorbedDays: number;
  steps: number;
  walkMin: number;
  z2Min: number;
  capFood: number;
  capActive: number;
  notes: string[];
  reductions: ReductionStep[];
}

export const MAX_COMP_DAYS = 14;

export function planCompensation(i: CompInput): CompResult {
  const debt = Math.max(0, Math.round(i.debt));
  const bank = i.plan.protocol.bank;
  const cf = bank.creditFactor;
  // O corte só vale sobre o que o cardápio permite sem furar o piso de calorias.
  const menuKcal = Math.min(i.plan.kcal, i.plan.protocol.targets.kcal);
  const capFood = i.mode === 'exercise' ? 0 : Math.max(0, Math.min(bank.maxFoodCut, menuKcal - bank.foodFloor));
  const capActive = i.mode === 'food' ? 0 : bank.maxExtraActive;
  const capEff = capActive * cf;
  const perDayCap = capFood + capEff;
  const notes: string[] = [];
  const base: CompResult = {
    debt,
    daysRequested: i.days,
    daysUsed: i.days,
    minDays: 0,
    perDayFood: 0,
    perDayActive: 0,
    perDayEffective: 0,
    absorbed: 0,
    absorbedDays: 0,
    steps: 0,
    walkMin: 0,
    z2Min: 0,
    capFood,
    capActive,
    notes,
    reductions: [],
  };
  if (debt === 0) return base;
  if (perDayCap <= 0) {
    notes.push(
      i.mode === 'food'
        ? 'O cardápio já está no piso de calorias: não dá para compensar só com comida. Use o modo misto ou exercício, ou absorva.'
        : 'Os limites atuais não deixam margem para compensar. Ajuste os limites em Ajustes ou absorva o débito.',
    );
    return { ...base, absorbed: debt, absorbedDays: Math.max(1, Math.round(debt / 800)) };
  }
  const minDays = Math.ceil(debt / perDayCap);
  const daysUsed = Math.max(i.days, Math.min(minDays, MAX_COMP_DAYS));
  if (minDays > i.days) {
    notes.push(`Dentro dos limites seguros, essa compensação precisa de ${Math.min(minDays, MAX_COMP_DAYS)} dias.`);
  }
  const coverable = Math.min(debt, daysUsed * perDayCap);
  const absorbed = debt - coverable;
  const absorbedDays = absorbed > 0 ? Math.max(1, Math.round(absorbed / 800)) : 0;
  if (absorbed > 0) {
    notes.push(
      `Mesmo em ${MAX_COMP_DAYS} dias sobram ${Math.round(absorbed)} kcal. Absorva essa parte: o resultado atrasa uns ${absorbedDays} dia(s), sem nenhum risco.`,
    );
  }
  const perDay = coverable / daysUsed;
  let food = 0;
  let eff = 0;
  if (i.mode === 'food') food = perDay;
  else if (i.mode === 'exercise') eff = perDay;
  else {
    food = perDay * i.foodShare;
    eff = perDay - food;
    if (food > capFood) {
      eff += food - capFood;
      food = capFood;
    }
    if (eff > capEff) {
      food += eff - capEff;
      eff = capEff;
    }
  }
  food = Math.min(food, capFood);
  eff = Math.min(eff, capEff);
  const active = cf > 0 ? eff / cf : 0;
  const w = i.weightKg;
  return {
    ...base,
    daysUsed,
    minDays,
    perDayFood: Math.round(food),
    perDayActive: Math.round(active),
    perDayEffective: Math.round(eff),
    absorbed: Math.round(absorbed),
    absorbedDays,
    steps: Math.round(active / kcalPerStep(w) / 100) * 100,
    walkMin: Math.round(active / walkKcalPerMin(w)),
    z2Min: i.z2PerMin > 0 ? Math.round(active / i.z2PerMin) : 0,
    reductions: reductionPlan(i.plan, food).steps,
  };
}

export interface CompToday {
  status: 'agendada' | 'ativa' | 'concluida' | 'expirada';
  dayIndex: number;
  of: number;
  food: number;
  active: number;
  steps: number;
  walkMin: number;
  progress: number;
  remainingDebt: number;
}

export function compensationToday(state: AppState, today: string, bankProjected: number): CompToday | null {
  const c = state.compensation;
  if (!c || !c.active) return null;
  const dayIndex = diffDays(today, c.startDate);
  const remainingDebt = Math.max(0, -Math.round(bankProjected));
  const progress = c.debt > 0 ? Math.min(1, Math.max(0, (c.debt - remainingDebt) / c.debt)) : 1;
  const w = currentWeight(state, today);
  let status: CompToday['status'] = 'ativa';
  if (remainingDebt === 0) status = 'concluida';
  else if (dayIndex < 0) status = 'agendada';
  else if (dayIndex >= c.days) status = 'expirada';
  return {
    status,
    dayIndex: Math.max(0, dayIndex) + 1,
    of: c.days,
    food: c.perDayFood,
    active: c.perDayActive,
    steps: Math.round(c.perDayActive / kcalPerStep(w) / 100) * 100,
    walkMin: Math.round(c.perDayActive / walkKcalPerMin(w)),
    progress,
    remainingDebt,
  };
}

export interface DayCuts {
  /** kcal a cortar porque a meta da versão ficou abaixo do cardápio. */
  planGap: number;
  /** kcal a cortar pela compensação ativa (só no dia de hoje). */
  compFood: number;
  kcal: number;
  steps: ReductionStep[];
  /** Parte do corte que a ordem de cortes não conseguiu distribuir. */
  uncovered: number;
}

/** Cortes concretos (em gramas) para um dia: meta abaixo do cardápio + compensação ativa hoje. */
export function dayCuts(ev: Pick<DayEval, 'plan' | 'target' | 'isToday'>, comp: CompToday | null): DayCuts {
  const planGap = Math.max(0, ev.plan.kcal - ev.target.kcal);
  const compFood = ev.isToday && comp?.status === 'ativa' ? comp.food : 0;
  const kcal = planGap + compFood;
  if (kcal <= 0) return { planGap, compFood, kcal: 0, steps: [], uncovered: 0 };
  const r = reductionPlan(ev.plan, kcal);
  return { planGap, compFood, kcal, steps: r.steps, uncovered: Math.max(0, Math.round(kcal - r.total)) };
}

/* ------------------------------------------------------- composição corporal */

export const bmi = (w: number, hCm: number) => w / (hCm / 100) ** 2;
export const whtr = (waist: number, hCm: number) => waist / hCm;
/** Relative Fat Mass (Woolcott & Bergman, 2018). */
export const rfm = (waist: number, hCm: number, sex: 'M' | 'F') => (sex === 'M' ? 64 : 76) - (20 * hCm) / waist;
/** Fórmula da Marinha dos EUA para homens (cm): cintura no umbigo e pescoço. */
export function navyBf(waist: number, neck: number, hCm: number): number | null {
  if (!(waist > neck)) return null;
  return 495 / (1.0324 - 0.19077 * Math.log10(waist - neck) + 0.15456 * Math.log10(hCm)) - 450;
}

export type LatestValues = Partial<Record<MeasureKey, { value: number; date: string }>>;

export function latestValues(ms: Measurement[], upTo?: string): LatestValues {
  const out: LatestValues = {};
  for (const m of sortedMeasurements(ms)) {
    if (upTo && m.date > upTo) break;
    for (const k of MEASURE_KEYS) {
      const v = m[k];
      if (typeof v === 'number' && !(k === 'weight' && !m.fasting && out.weight)) out[k] = { value: v, date: m.date };
    }
  }
  return out;
}

export const MEASURE_KEYS: MeasureKey[] = [
  'weight',
  'waistNavel',
  'waistNarrow',
  'neck',
  'chest',
  'hip',
  'armRelaxed',
  'armFlexed',
  'thigh',
  'calf',
  'restingHr',
];

export interface Composition {
  bmi?: number;
  whtr?: number;
  rfm?: number;
  navy?: number;
  fatMass?: number;
  leanMass?: number;
  method?: string;
}

export function composition(lv: LatestValues, profile: Profile | null): Composition {
  if (!profile) return {};
  const h = profile.heightCm;
  const out: Composition = {};
  const w = lv.weight?.value;
  const waist = lv.waistNavel?.value;
  const neck = lv.neck?.value;
  if (w) out.bmi = bmi(w, h);
  if (waist) {
    out.whtr = whtr(waist, h);
    out.rfm = rfm(waist, h, profile.sex);
  }
  if (waist && neck && profile.sex === 'M') out.navy = navyBf(waist, neck, h) ?? undefined;
  const bf = out.navy !== undefined && out.rfm !== undefined ? (out.navy + out.rfm) / 2 : (out.navy ?? out.rfm);
  if (w && bf !== undefined) {
    out.fatMass = (w * bf) / 100;
    out.leanMass = w - out.fatMass;
    out.method = out.navy !== undefined && out.rfm !== undefined ? 'média Marinha + RFM' : out.navy !== undefined ? 'Marinha' : 'RFM';
  }
  return out;
}

/* ------------------------------------------------------------ tendências */

export interface Point {
  date: string;
  value: number;
}

/** Um peso por dia: o primeiro em jejum do dia. */
export function fastingWeights(ms: Measurement[]): Point[] {
  const out: Point[] = [];
  for (const m of sortedMeasurements(ms)) {
    if (!m.fasting || !m.weight) continue;
    if (out.length && out[out.length - 1].date === m.date) continue;
    out.push({ date: m.date, value: m.weight });
  }
  return out;
}

export function seriesOf(ms: Measurement[], key: MeasureKey): Point[] {
  if (key === 'weight') return fastingWeights(ms).length ? fastingWeights(ms) : allWeights(ms);
  const out: Point[] = [];
  for (const m of sortedMeasurements(ms)) {
    const v = m[key];
    if (typeof v !== 'number') continue;
    if (out.length && out[out.length - 1].date === m.date) out[out.length - 1] = { date: m.date, value: v };
    else out.push({ date: m.date, value: v });
  }
  return out;
}

function allWeights(ms: Measurement[]): Point[] {
  const out: Point[] = [];
  for (const m of sortedMeasurements(ms)) {
    if (!m.weight) continue;
    if (out.length && out[out.length - 1].date === m.date) continue;
    out.push({ date: m.date, value: m.weight });
  }
  return out;
}

/** Média móvel exponencial (tendência de peso), alpha 0,1 por pesagem. */
export function emaTrend(series: Point[], alpha = 0.1): Point[] {
  const out: Point[] = [];
  let t: number | null = null;
  for (const p of series) {
    t = t === null ? p.value : t + alpha * (p.value - t);
    out.push({ date: p.date, value: t });
  }
  return out;
}

export function linearSlope(points: { x: number; y: number }[]): number | null {
  const n = points.length;
  if (n < 2) return null;
  const mx = points.reduce((a, p) => a + p.x, 0) / n;
  const my = points.reduce((a, p) => a + p.y, 0) / n;
  let num = 0;
  let den = 0;
  for (const p of points) {
    num += (p.x - mx) * (p.y - my);
    den += (p.x - mx) ** 2;
  }
  return den === 0 ? null : num / den;
}

export interface WeekAvg {
  week: number;
  from: string;
  to: string;
  avg: number | null;
  n: number;
}

export function weeklyAverages(state: AppState, today: string): WeekAvg[] {
  const start = state.settings.startDate;
  const weights = fastingWeights(state.measurements);
  const dayNumber = diffDays(today, start) + 1;
  const weeks = Math.max(0, Math.ceil(dayNumber / 7));
  const out: WeekAvg[] = [];
  for (let w = 1; w <= weeks; w++) {
    const from = addDays(start, (w - 1) * 7);
    const to = addDays(start, w * 7 - 1);
    const pts = weights.filter((p) => p.date >= from && p.date <= to);
    out.push({ week: w, from, to, avg: pts.length ? pts.reduce((a, p) => a + p.value, 0) / pts.length : null, n: pts.length });
  }
  return out;
}

/* ------------------------------------------------------------- revisões */

export type ReviewRec = 'manter' | 'reduzir' | 'aderencia' | 'aumentar' | 'recomposicao' | 'dados';

export interface Review {
  available: boolean;
  dayNumber: number;
  daysToReview: number;
  week?: number;
  prevAvg?: number;
  lastAvg?: number;
  rateKg?: number;
  ratePct?: number;
  adherence?: number;
  waistDelta?: number;
  rec?: ReviewRec;
  title: string;
  message: string;
}

export function review(state: AppState, opts: EvalOpts, bank?: BankSummary): Review {
  const start = state.settings.startDate;
  const dayNumber = diffDays(opts.today, start) + 1;
  if (dayNumber < 14) {
    return {
      available: false,
      dayNumber,
      daysToReview: 14 - dayNumber,
      title: 'Revisão do dia 14',
      message: `Faltam ${Math.max(0, 14 - dayNumber)} dia(s). Pese-se toda manhã em jejum para a revisão ter dados.`,
    };
  }
  const weeks = weeklyAverages(state, opts.today);
  const n = Math.floor(dayNumber / 7);
  const prev = weeks[n - 2];
  const last = weeks[n - 1];
  const b = bank ?? bankSummary(state, opts);
  const recent = b.rows.slice(-14);
  const adherence = recent.length ? (recent.filter((r) => Math.abs(r.ev.foodDev) <= 100).length / recent.length) * 100 : undefined;
  const waists = seriesOf(state.measurements, 'waistNavel').filter((p) => p.date >= addDays(opts.today, -15));
  const waistDelta = waists.length >= 2 ? waists[waists.length - 1].value - waists[0].value : undefined;
  if (!prev?.avg || !last?.avg) {
    return {
      available: true,
      dayNumber,
      daysToReview: 0,
      week: n,
      adherence,
      waistDelta,
      rec: 'dados',
      title: `Revisão · semana ${n}`,
      message: 'Faltam pesagens em jejum em uma das duas últimas semanas. Registre o peso toda manhã para comparar as médias.',
    };
  }
  const rate = prev.avg - last.avg;
  const ratePct = (rate / prev.avg) * 100;
  let rec: ReviewRec = 'manter';
  let message = '';
  if (rate >= 0.6 && rate <= 1.2) {
    rec = 'manter';
    message = 'Ritmo dentro da faixa (0,7–1,2 kg/semana). Mantenha calorias, passos e treinos.';
  } else if (rate < 0.6) {
    if (waistDelta !== undefined && waistDelta <= -1 && rate > -0.3) {
      rec = 'recomposicao';
      message = 'A cintura está caindo mesmo com o peso parado: recomposição ou retenção de água. Mantenha o plano.';
    } else if (adherence !== undefined && adherence < 90) {
      rec = 'aderencia';
      message = `Aderência de ${Math.round(adherence)}%: não reduza calorias. Primeiro ajuste o plano para conseguir cumpri-lo.`;
    } else {
      rec = 'reduzir';
      message = 'Perda abaixo de 0,6 kg/semana com boa aderência. Confira passos e pesagem dos alimentos; se estiver tudo certo, reduza 150–200 kcal (piso de 2.000 kcal sem acompanhamento).';
    }
  } else if (n >= 3) {
    rec = 'aumentar';
    message = 'Perda acima de 1,2 kg/semana depois da semana 2: aumente 150–200 kcal em carboidrato no pré ou no pós-treino.';
  } else {
    rec = 'manter';
    message = 'Perda alta, mas a semana 1 vem inflada por água e glicogênio. Mantenha e reavalie no dia 21.';
  }
  return {
    available: true,
    dayNumber,
    daysToReview: 0,
    week: n,
    prevAvg: prev.avg,
    lastAvg: last.avg,
    rateKg: rate,
    ratePct,
    adherence,
    waistDelta,
    rec,
    title: `Revisão · semana ${n - 1} → ${n}`,
    message,
  };
}

export interface AdaptiveTdee {
  tdee: number;
  avgIntake: number;
  slopeKgWeek: number;
  days: number;
  weighIns: number;
}

/** Gasto real estimado = ingestão média − variação de peso × 7.700 kcal/kg (ignora a semana 1). */
export function adaptiveTdee(state: AppState, opts: EvalOpts, bank?: BankSummary): AdaptiveTdee | null {
  const start = state.settings.startDate;
  const from = addDays(start, 7) > addDays(opts.today, -28) ? addDays(start, 7) : addDays(opts.today, -28);
  const b = bank ?? bankSummary(state, opts);
  const rows = b.rows.filter((r) => r.date >= from);
  const weights = fastingWeights(state.measurements).filter((p) => p.date >= from && p.date < opts.today);
  if (rows.length < 10 || weights.length < 7) return null;
  const slope = linearSlope(weights.map((p) => ({ x: diffDays(p.date, from), y: p.value })));
  if (slope === null) return null;
  const avgIntake = rows.reduce((a, r) => a + r.ev.actual.kcal, 0) / rows.length;
  return {
    tdee: Math.round(avgIntake - slope * 7700),
    avgIntake: Math.round(avgIntake),
    slopeKgWeek: slope * 7,
    days: rows.length,
    weighIns: weights.length,
  };
}

/* ------------------------------------------------- liberação do intervalado */

export function intervalCriteria(state: AppState): { tempoRpe: boolean | null; restingHr: boolean | null } {
  const rpes: number[] = [];
  for (const d of Object.keys(state.days).sort()) {
    for (const ex of state.days[d].exercises) {
      if (ex.kind === 'spinning' && ex.template === 'tempo' && ex.status === 'done' && typeof ex.rpe === 'number') rpes.push(ex.rpe);
    }
  }
  const hrs = seriesOf(state.measurements, 'restingHr');
  let restingHr: boolean | null = null;
  if (hrs.length >= 2) {
    const base = hrs.slice(0, Math.min(3, hrs.length - 1));
    const avg = base.reduce((a, p) => a + p.value, 0) / base.length;
    restingHr = hrs[hrs.length - 1].value <= avg + 5;
  }
  return { tempoRpe: rpes.length ? rpes.every((r) => r <= 6) : null, restingHr };
}

/* ------------------------------------------------------- refeição do momento */

export function currentMealIndex(meals: Meal[], nowMin: number): { index: number; phase: 'antes' | 'agora' | 'encerrado' } {
  if (!meals.length) return { index: 0, phase: 'antes' };
  const starts = meals.map((m) => minutesOf(m.time) - 45);
  const close = Math.max(minutesOf('21:00'), minutesOf(meals[meals.length - 1].time) + 60);
  if (nowMin < starts[0]) return { index: 0, phase: 'antes' };
  if (nowMin >= close) return { index: meals.length - 1, phase: 'encerrado' };
  let idx = 0;
  for (let i = 0; i < starts.length; i++) if (nowMin >= starts[i]) idx = i;
  return { index: idx, phase: 'agora' };
}
