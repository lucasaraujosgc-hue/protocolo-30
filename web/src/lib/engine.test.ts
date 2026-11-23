import { describe, expect, it } from 'vitest';
import { addDays, diffDays, weekday } from './dates';
import {
  bankSummary,
  calibrationSamples,
  compensationToday,
  composition,
  currentMealIndex,
  dayCuts,
  defaultMealTime,
  emptyDay,
  evalDay,
  exerciseTargets,
  kcalPerStep,
  latestValues,
  makeMealLog,
  navyBf,
  planCompensation,
  plateOf,
  review,
  rfm,
} from './engine';
import { FOOD_BY_ID, PRESET_BY_ID, presetItem } from './foods';
import { mealTotals, planOf, reductionPlan } from './plan';
import { defaultProtocol, upsertVersion } from './protocol';
import { blocksMinutes, defaultTraining, plannedSessions, scheduleWarnings } from './schedule';
import type { AppState, DayLog, Measurement, Protocol } from './types';

const START = '2026-11-23';
const PROTO = defaultProtocol(START);
const PLAN = planOf(PROTO);
const MEAL = PLAN.mealById;

function baseState(): AppState {
  return {
    version: 2,
    profile: { heightCm: 186, age: 31, sex: 'M' },
    settings: { startDate: START },
    protocols: [defaultProtocol(START)],
    days: {},
    measurements: [{ id: 'm0', date: START, time: '06:00', fasting: true, weight: 106, waistNavel: 106 }],
    compensation: null,
    updatedAt: '',
  };
}

function withDay(s: AppState, date: string, fn: (d: DayLog) => void): AppState {
  const d = structuredClone(s.days[date] ?? emptyDay());
  fn(d);
  return { ...s, days: { ...s.days, [date]: d } };
}

describe('datas', () => {
  it('usa data local e dia da semana correto', () => {
    expect(weekday(START)).toBe(1); // segunda
    expect(addDays(START, 29)).toBe('2026-12-22');
    expect(diffDays('2026-12-06', START)).toBe(13);
  });
});

describe('plano alimentar', () => {
  it('soma as calorias e macros do cardápio', () => {
    expect(PLAN.kcal).toBe(2253);
    expect(PROTO.targets.kcal).toBe(2253);
    expect(Math.round(PLAN.totals.p)).toBe(197);
    expect(Math.round(PLAN.totals.c)).toBe(240);
    expect(Math.round(PLAN.totals.f)).toBe(56);
  });

  it('sugere cortes que preservam a proteína', () => {
    const r = reductionPlan(PLAN, 300);
    expect(r.total).toBeGreaterThanOrEqual(299);
    expect(r.total).toBeLessThan(320);
    expect(r.steps[0].food).toBe('pasta_amendoim');
    expect(r.steps.some((s) => s.food === 'frango' || s.food === 'patinho' || s.food === 'whey')).toBe(false);
  });
});

describe('agenda de treinos', () => {
  const s = defaultTraining();
  it('segue a semana-padrão', () => {
    expect(plannedSessions(s, START, START).map((x) => x.key)).toEqual(['lift']);
    expect(plannedSessions(s, START, '2026-11-25').map((x) => x.template)).toContain('tempo');
    expect(plannedSessions(s, START, '2026-11-29')).toEqual([]);
    expect(plannedSessions(s, START, '2026-11-22')).toEqual([]);
  });
  it('libera o intervalado a partir da data definida', () => {
    const s2 = { ...s, intervalsFrom: '2026-12-09' };
    expect(plannedSessions(s2, START, '2026-12-02').find((x) => x.key === 'spin')?.template).toBe('tempo');
    expect(plannedSessions(s2, START, '2026-12-09').find((x) => x.key === 'spin')?.template).toBe('intervalado');
  });
  it('não acusa problema na semana padrão', () => {
    expect(scheduleWarnings(s)).toEqual([]);
    expect(scheduleWarnings({ ...s, spinDays: [1, 2, 3, 5, 6] })).toContain('Há spinning na manhã de um dia de perna.');
  });
});

describe('banco de calorias', () => {
  const today = '2026-11-26';
  const opts = { today, nowMin: 12 * 60 };

  it('o consumo do dia só conta o que foi registrado, mesmo depois do horário', () => {
    let s = baseState();
    const at7 = { today: START, nowMin: 7 * 60 };
    expect(evalDay(s, START, at7).consumed.kcal).toBe(0);
    expect(Math.round(evalDay(s, START, at7).actual.kcal)).toBe(2253);
    s = withDay(s, START, (d) => {
      d.meals.cafe = makeMealLog(PLAN, MEAL.cafe, 'planned');
    });
    expect(Math.round(evalDay(s, START, at7).consumed.kcal)).toBe(457);
    expect(evalDay(s, START, at7).balance).toBe(0);
  });

  it('dia sem registros = plano seguido = saldo zero', () => {
    const s = baseState();
    const ev = evalDay(s, START, opts);
    expect(ev.foodDev).toBe(0);
    expect(ev.balance).toBe(0);
  });

  it('pizza fora do plano gera débito integral', () => {
    let s = baseState();
    const pizza = presetItem(PRESET_BY_ID.pizza_mussarela, 2);
    s = withDay(s, START, (d) => d.extras.push({ id: 'x', name: pizza.name, kcal: pizza.kcal, p: pizza.p, c: pizza.c, f: pizza.f, at: '' }));
    expect(evalDay(s, START, opts).balance).toBe(-580);
  });

  it('refeição pulada vira crédito, metade da refeição vira meio crédito', () => {
    let s = baseState();
    s = withDay(s, START, (d) => {
      d.meals.lanche = makeMealLog(PLAN, MEAL.lanche, 'skipped');
      d.meals.almoco = makeMealLog(PLAN, MEAL.almoco, 'less', { fraction: 0.5 });
    });
    const ev = evalDay(s, START, opts);
    expect(ev.foodDev).toBeGreaterThan(350 + 280);
    expect(ev.foodDev).toBeLessThan(357 + 284);
  });

  it('treino não feito é débito; treino extra é crédito com desconto', () => {
    let s = baseState();
    s = withDay(s, '2026-11-24', (d) => d.exercises.push({ id: 'a', kind: 'spinning', template: 'z2', status: 'missed', plannedKey: 'spin', at: '' }));
    s = withDay(s, '2026-11-25', (d) =>
      d.exercises.push({ id: 'b', kind: 'outro', status: 'done', activeKcal: 200, at: '' }),
    );
    expect(evalDay(s, '2026-11-24', opts).balance).toBe(-250);
    expect(evalDay(s, '2026-11-25', opts).balance).toBe(150);
  });

  it('passos abaixo da meta custam calorias proporcionais ao peso', () => {
    let s = baseState();
    s = withDay(s, '2026-11-24', (d) => (d.steps = 6000));
    const ev = evalDay(s, '2026-11-24', opts);
    expect(Math.round(ev.stepsDevRaw)).toBe(Math.round(-4000 * kcalPerStep(106)));
  });

  it('calibra a meta do treino com a mediana das 3 primeiras sessões', () => {
    let s = baseState();
    const dates = ['2026-11-24', '2026-11-27', '2026-11-28'];
    const kcal = [320, 300, 340];
    dates.forEach((date, i) => {
      s = withDay(s, date, (d) => d.exercises.push({ id: date, kind: 'spinning', template: 'z2', status: 'done', plannedKey: 'spin', activeKcal: kcal[i], at: '' }));
    });
    const t = exerciseTargets(s.protocols[0], calibrationSamples(s));
    expect(t.z2.value).toBe(320);
    expect(t.z2.calibrated).toBe(true);
  });

  it('"fiz parte" sem calorias do relógio conta metade da meta', () => {
    let s = baseState();
    s = withDay(s, '2026-11-24', (d) => d.exercises.push({ id: 'p', kind: 'spinning', template: 'z2', status: 'partial', plannedKey: 'spin', at: '' }));
    expect(evalDay(s, '2026-11-24', opts).exDevAdj).toBe(-125);
  });

  it('registro de refeição que saiu do cardápio continua contando', () => {
    let s = baseState();
    s = withDay(s, START, (d) => {
      d.meals.ceia = { status: 'swapped', kcal: 300, p: 20, c: 30, f: 10, items: [], at: '' };
    });
    const ev = evalDay(s, START, opts);
    expect(ev.orphanMeals.map((o) => o.id)).toEqual(['ceia']);
    expect(ev.foodDev).toBe(-300);
  });

  it('acumula o saldo dos dias fechados', () => {
    let s = baseState();
    s = withDay(s, START, (d) => d.extras.push({ id: 'x', name: 'x', kcal: 300, p: 0, c: 0, f: 0, at: '' }));
    s = withDay(s, '2026-11-24', (d) => d.extras.push({ id: 'y', name: 'y', kcal: 200, p: 0, c: 0, f: 0, at: '' }));
    const b = bankSummary(s, opts);
    expect(b.rows.length).toBe(3);
    expect(b.closed).toBe(-500);
  });
});

describe('compensação', () => {
  const base = { plan: PLAN, weightKg: 106, z2PerMin: 250 / 30, foodShare: 0.5 };

  it('divide a dívida entre comida e exercício dentro dos limites', () => {
    const r = planCompensation({ ...base, debt: 580, mode: 'mix', days: 3 });
    expect(r.daysUsed).toBe(3);
    expect(r.perDayFood).toBe(97);
    expect(r.perDayEffective).toBe(97);
    expect(r.perDayActive).toBe(129);
    expect(r.absorbed).toBe(0);
  });

  it('estende os dias quando 1 dia ultrapassa o limite seguro', () => {
    const r = planCompensation({ ...base, debt: 900, mode: 'food', days: 1 });
    expect(r.daysUsed).toBe(3);
    expect(r.perDayFood).toBe(300);
  });

  it('manda absorver o que não cabe em 14 dias', () => {
    const r = planCompensation({ ...base, debt: 10000, mode: 'mix', days: 3 });
    expect(r.daysUsed).toBe(14);
    expect(r.absorbed).toBe(10000 - 14 * 525);
  });

  it('"Segui" durante a compensação registra o prato reduzido e o banco reconhece', () => {
    const today = '2026-11-25';
    let s = baseState();
    s.compensation = { active: true, mode: 'food', days: 3, startDate: today, foodShare: 0.5, debt: 900, perDayFood: 300, perDayActive: 0, createdAt: '' };
    s = withDay(s, START, (d) => d.extras.push({ id: 'x', name: 'pizza', kcal: 900, p: 0, c: 0, f: 0, at: '' }));
    const b0 = bankSummary(s, { today, nowMin: 5 * 60 });
    const comp = compensationToday(s, today, b0.projected);
    expect(comp?.status).toBe('ativa');
    const cuts = dayCuts(b0.today, comp);
    expect(cuts.kcal).toBe(300);
    expect(cuts.steps.length).toBeGreaterThan(0);
    s = withDay(s, today, (d) => {
      for (const m of PLAN.meals) d.meals[m.id] = makeMealLog(PLAN, m, 'planned', { cuts: cuts.steps });
    });
    const ev = evalDay(s, today, { today, nowMin: 22 * 60 });
    expect(ev.foodDev).toBeGreaterThanOrEqual(295);
    expect(ev.foodDev).toBeLessThanOrEqual(310);
  });

  it('cortes usam as gramas reais quando o prato é maior que o da ordem de cortes', () => {
    const p = structuredClone(defaultProtocol(START));
    p.meals = p.meals.map((m) => (m.id === 'almoco' ? { ...m, items: m.items.map((it) => (it.food === 'arroz' ? { ...it, grams: 200 } : it)) } : m));
    const plan = planOf(p);
    const r = reductionPlan(plan, 500);
    const arroz = r.steps.find((x) => x.food === 'arroz');
    expect(arroz?.fromG).toBe(200);
    // 200 → 140 no 1º passo do arroz; o último passo só tira 40 g porque os 500 kcal já fecham
    expect(arroz?.toG).toBe(100);
  });

  it('meta abaixo do cardápio gera cortes no dia, mesmo sem compensação', () => {
    const p: Protocol = { ...defaultProtocol(START), targets: { ...PROTO.targets, kcal: 2100 } };
    const cuts = dayCuts({ plan: planOf(p), target: p.targets, isToday: false }, null);
    expect(cuts.planGap).toBe(153);
    expect(cuts.compFood).toBe(0);
    expect(cuts.steps.reduce((a, x) => a + x.kcal, 0)).toBeGreaterThanOrEqual(150);
  });
});

describe('protocolo versionado', () => {
  const today = '2026-12-01';
  const opts = { today, nowMin: 12 * 60 };
  const v2: Protocol = {
    ...defaultProtocol('2026-11-28'),
    id: 'v2',
    name: 'Menos calorias',
    targets: { ...PROTO.targets, kcal: 2100, steps: 12000 },
  };

  it('cada dia usa a versão que estava em vigor', () => {
    const s = { ...baseState(), protocols: upsertVersion([defaultProtocol(START)], v2) };
    expect(evalDay(s, '2026-11-27', opts).target.kcal).toBe(2253);
    expect(evalDay(s, '2026-11-28', opts).target.kcal).toBe(2100);
    // dia sem registro na versão nova: comeu o cardápio (2253) com meta 2100
    expect(evalDay(s, '2026-11-28', opts).foodDev).toBe(-153);
    expect(evalDay(s, '2026-11-27', opts).foodDev).toBe(0);
  });

  it('calibração recomeça quando a sessão muda numa versão nova', () => {
    let s = baseState();
    for (const [date, kcal] of [
      ['2026-11-24', 320],
      ['2026-11-27', 300],
      ['2026-11-28', 340],
    ] as const) {
      s = withDay(s, date, (d) => d.exercises.push({ id: date, kind: 'spinning', template: 'z2', status: 'done', plannedKey: 'spin', activeKcal: kcal, at: '' }));
    }
    const longer = structuredClone(defaultProtocol('2026-11-30'));
    longer.id = 'z45';
    longer.training.sessions.z2 = { ...longer.training.sessions.z2, name: 'Z2 45', blocks: ['Aquecimento · 5 min', 'Treino · 37 min', 'Desaquecimento · 3 min'] };
    longer.training.exerciseTargets.z2 = 380;
    s = { ...s, protocols: upsertVersion(s.protocols, longer) };
    const samples = calibrationSamples(s);
    expect(exerciseTargets(s.protocols[0], samples).z2).toMatchObject({ value: 320, calibrated: true });
    expect(exerciseTargets(longer, samples).z2).toMatchObject({ value: 380, calibrated: false });
    // musculação não mudou: continua usando as amostras antigas (nenhuma aqui)
    expect(exerciseTargets(longer, samples).musculacao.value).toBe(280);
  });
});

describe('composição corporal', () => {
  it('estima gordura por RFM e pela fórmula da Marinha', () => {
    expect(rfm(106, 186, 'M')).toBeCloseTo(28.9, 1);
    expect(navyBf(106, 43, 186)).toBeCloseTo(26.0, 0);
    const ms: Measurement[] = [{ id: 'a', date: START, time: '06:00', fasting: true, weight: 106, waistNavel: 106, neck: 43 }];
    const c = composition(latestValues(ms), { heightCm: 186, age: 31, sex: 'M' });
    expect(c.leanMass).toBeGreaterThan(74);
    expect(c.leanMass).toBeLessThan(80);
  });
});

describe('revisão do dia 14', () => {
  it('recomenda manter quando a perda está na faixa', () => {
    const s = baseState();
    s.measurements = Array.from({ length: 14 }, (_, i) => ({
      id: `w${i}`,
      date: addDays(START, i),
      time: '06:00',
      fasting: true,
      weight: 106 - 0.14 * i,
    }));
    const r = review(s, { today: addDays(START, 13), nowMin: 600 });
    expect(r.available).toBe(true);
    expect(r.rateKg).toBeCloseTo(0.98, 1);
    expect(r.rec).toBe('manter');
  });
});

describe('refeição atual', () => {
  it('escolhe a refeição pela hora', () => {
    expect(currentMealIndex(PLAN.meals.map((m) => m.time), 5 * 60)).toEqual({ index: 0, phase: 'antes' });
    expect(currentMealIndex(PLAN.meals.map((m) => m.time), 9 * 60 + 20).index).toBe(1);
    expect(currentMealIndex(PLAN.meals.map((m) => m.time), 21 * 60 + 30).phase).toBe('encerrado');
  });
});

describe('quantidades por item', () => {
  const almoco = MEAL.almoco;
  const feijaoIdx = almoco.items.findIndex((it) => it.food === 'feijao');
  const arrozIdx = almoco.items.findIndex((it) => it.food === 'arroz');
  const kcalOf = (food: string, grams: number) => (FOOD_BY_ID[food].per100.kcal * grams) / 100;

  it('almoço sem feijão tira só o feijão', () => {
    const log = makeMealLog(PLAN, almoco, 'less', { portions: [{ i: feijaoIdx, food: 'feijao', grams: 0 }] });
    expect(log.kcal).toBeCloseTo(mealTotals(PLAN, almoco).kcal - kcalOf('feijao', 100), 0);
    expect(log.portions).toEqual([{ i: feijaoIdx, food: 'feijao', grams: 0 }]);
  });

  it('a mais: mais arroz e um copo de refrigerante', () => {
    const refri = presetItem(PRESET_BY_ID.refri_copo, 1);
    const log = makeMealLog(PLAN, almoco, 'more', { portions: [{ i: arrozIdx, food: 'arroz', grams: 180 }], items: [refri] });
    expect(log.kcal).toBeCloseTo(mealTotals(PLAN, almoco).kcal + kcalOf('arroz', 60) + 106, 0);
    expect(log.items?.[0].name).toContain('Refrigerante');
  });

  it('quantidade registrada vale sobre o corte do dia; item que mudou de lugar é ignorado', () => {
    const cuts = reductionPlan(PLAN, 400).steps;
    const plate = plateOf(almoco, cuts, [{ i: arrozIdx, food: 'arroz', grams: 120 }]);
    expect(plate.items[arrozIdx].grams).toBe(120);
    const moved = plateOf(almoco, [], [{ i: arrozIdx, food: 'batata', grams: 999 }]);
    expect(moved.items[arrozIdx].grams).toBe(120);
  });

  it('item com calorias próprias usa fração da porção', () => {
    const meal = { ...almoco, items: [{ label: 'Marmita', kcal: 600, p: 40, c: 60, f: 20 }] };
    const log = makeMealLog(PLAN, meal, 'less', { portions: [{ i: 0, mult: 0.5 }] });
    expect(log.kcal).toBe(300);
    expect(log.p).toBe(20);
  });
});

describe('horários do dia', () => {
  // START (23/11) é segunda: musculação às 17:00, sem spinning.
  const MONDAY = START;
  const SUNDAY = '2026-11-29';
  const timesOf = (s: AppState, date: string) => evalDay(s, date, { today: date, nowMin: 12 * 60 }).meals.map((m) => m.time);
  const ate = (date: string, meal: string, time: string) => (s: AppState) =>
    withDay(s, date, (d) => {
      d.meals[meal] = makeMealLog(PLAN, MEAL[meal], 'planned', { time });
    });

  it('sem registro, vale o cardápio', () => {
    expect(timesOf(baseState(), MONDAY)).toEqual(['06:15', '10:00', '13:00', '16:00', '18:45']);
  });

  it('café atrasado empurra as próximas, mas o pré-treino respeita o treino e o jantar fica', () => {
    const s = ate(MONDAY, 'cafe', '06:57')(baseState());
    expect(timesOf(s, MONDAY)).toEqual(['06:57', '10:40', '13:40', '16:30', '18:45']);
  });

  it('almoço adiantado antecipa o pré-treino', () => {
    const s = ate(MONDAY, 'almoco', '12:00')(baseState());
    expect(timesOf(s, MONDAY)).toEqual(['06:15', '10:00', '12:00', '15:00', '18:45']);
  });

  it('almoço muito tarde: pré-treino fica preso ao treino e avisa que está perto', () => {
    const s = ate(MONDAY, 'almoco', '15:45')(baseState());
    const ev = evalDay(s, MONDAY, { today: MONDAY, nowMin: 16 * 60 });
    expect(ev.meals.map((m) => m.time)).toEqual(['06:15', '10:00', '15:45', '16:30', '18:45']);
    expect(ev.meals[3].tight).toBe(true);
    expect(ev.meals[3].passed).toBe(false);
  });

  it('domingo sem treino: atraso passa para todas, até o limite das 20:30', () => {
    expect(timesOf(ate(SUNDAY, 'almoco', '14:00')(baseState()), SUNDAY)).toEqual(['06:15', '10:00', '14:00', '17:00', '19:45']);
    expect(timesOf(ate(SUNDAY, 'almoco', '15:00')(baseState()), SUNDAY)).toEqual(['06:15', '10:00', '15:00', '18:00', '20:30']);
  });

  it('diferença pequena (menos de 15 min) não mexe nos horários', () => {
    expect(timesOf(ate(MONDAY, 'cafe', '06:25')(baseState()), MONDAY)).toEqual(['06:25', '10:00', '13:00', '16:00', '18:45']);
  });

  it('horário sugerido: agora, se perto do previsto; senão, o previsto', () => {
    const me = { time: '13:00', log: undefined };
    expect(defaultMealTime(me, true, 14 * 60)).toBe('14:00');
    expect(defaultMealTime(me, true, 15 * 60)).toBe('13:00');
    expect(defaultMealTime(me, false, 14 * 60)).toBe('13:00');
  });

  it('lê a duração das sessões pelos blocos', () => {
    const t = defaultTraining();
    expect(blocksMinutes(t.sessions.z2.blocks)).toBe(30);
    expect(blocksMinutes(t.sessions.tempo.blocks)).toBe(30);
    expect(blocksMinutes(t.sessions.intervalado.blocks)).toBe(30);
  });
});
