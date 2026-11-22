import { describe, expect, it } from 'vitest';
import { addDays, diffDays, weekday } from './dates';
import {
  bankSummary,
  composition,
  currentMealIndex,
  emptyDay,
  evalDay,
  exerciseTargets,
  kcalPerStep,
  latestValues,
  makeMealLog,
  navyBf,
  planCompensation,
  review,
  rfm,
} from './engine';
import { PRESET_BY_ID, presetItem } from './foods';
import { MEAL_BY_ID, PLAN_KCAL, PLAN_TOTALS, reductionPlan } from './plan';
import { defaultSettings, plannedSessions, scheduleWarnings } from './schedule';
import type { AppState, DayLog, Measurement } from './types';

const START = '2026-11-23';

function baseState(): AppState {
  return {
    version: 1,
    profile: { heightCm: 186, age: 31, sex: 'M' },
    settings: defaultSettings(START),
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
    expect(PLAN_KCAL).toBe(2253);
    expect(Math.round(PLAN_TOTALS.p)).toBe(197);
    expect(Math.round(PLAN_TOTALS.c)).toBe(240);
    expect(Math.round(PLAN_TOTALS.f)).toBe(56);
  });

  it('sugere cortes que preservam a proteína', () => {
    const r = reductionPlan(300);
    expect(r.total).toBeGreaterThanOrEqual(299);
    expect(r.total).toBeLessThan(320);
    expect(r.steps[0].food).toBe('pasta_amendoim');
    expect(r.steps.some((s) => s.food === 'frango' || s.food === 'patinho' || s.food === 'whey')).toBe(false);
  });
});

describe('agenda de treinos', () => {
  const s = defaultSettings(START);
  it('segue a semana-padrão', () => {
    expect(plannedSessions(s, START).map((x) => x.key)).toEqual(['lift']);
    expect(plannedSessions(s, '2026-11-25').map((x) => x.template)).toContain('tempo');
    expect(plannedSessions(s, '2026-11-29')).toEqual([]);
    expect(plannedSessions(s, '2026-11-22')).toEqual([]);
  });
  it('libera o intervalado a partir da data definida', () => {
    const s2 = { ...s, intervalsFrom: '2026-12-09' };
    expect(plannedSessions(s2, '2026-12-02').find((x) => x.key === 'spin')?.template).toBe('tempo');
    expect(plannedSessions(s2, '2026-12-09').find((x) => x.key === 'spin')?.template).toBe('intervalado');
  });
  it('não acusa problema na semana padrão', () => {
    expect(scheduleWarnings(s)).toEqual([]);
    expect(scheduleWarnings({ ...s, spinDays: [1, 2, 3, 5, 6] })).toContain('Há spinning na manhã de um dia de perna.');
  });
});

describe('banco de calorias', () => {
  const today = '2026-11-26';
  const opts = { today, nowMin: 12 * 60 };

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
      d.meals.lanche = makeMealLog(MEAL_BY_ID.lanche, 'skipped');
      d.meals.almoco = makeMealLog(MEAL_BY_ID.almoco, 'less', { fraction: 0.5 });
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
    const t = exerciseTargets(s);
    expect(t.z2.value).toBe(320);
    expect(t.z2.calibrated).toBe(true);
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
  const settings = defaultSettings(START);
  const base = { settings, weightKg: 106, z2PerMin: 250 / 30, planKcal: PLAN_KCAL, foodShare: 0.5 };

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
    expect(currentMealIndex(5 * 60)).toEqual({ index: 0, phase: 'antes' });
    expect(currentMealIndex(9 * 60 + 20).index).toBe(1);
    expect(currentMealIndex(21 * 60 + 30).phase).toBe('encerrado');
  });
});
