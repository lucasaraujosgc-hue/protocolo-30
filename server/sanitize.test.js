import { describe, expect, it } from 'vitest';
import { defaultProtocol, mergeProtocol, parseProtocolInput } from '../web/src/lib/protocol';
import { sanitizeDay, sanitizeProtocols, sanitizeSettings, sanitizeState } from './sanitize.js';

const START = '2026-11-23';
const plain = (o) => JSON.parse(JSON.stringify(o));

describe('servidor · protocolo', () => {
  it('aceita o protocolo do app sem alterar nada', () => {
    const p = plain(defaultProtocol(START));
    expect(sanitizeProtocols([p])).toEqual([p]);
  });

  it('aceita um protocolo importado com alimento e item próprios', () => {
    const base = defaultProtocol(START);
    const parsed = parseProtocolInput(
      JSON.stringify({
        protocolo: {
          foods: [{ id: 'tapioca', name: 'Tapioca', per100: { kcal: 240, p: 0, c: 60, f: 0 } }],
          meals: [{ id: 'ceia', name: 'Ceia', time: '20:30', items: [{ food: 'tapioca', grams: 50 }, { label: 'Chá', kcal: 0, p: 0, c: 0, f: 0 }] }],
        },
      }),
    );
    const next = plain(mergeProtocol(base, parsed, '2026-12-01'));
    expect(sanitizeProtocols([next])).toEqual([next]);
  });

  it('uma versão por data e em ordem', () => {
    const a = plain({ ...defaultProtocol('2026-12-01'), id: 'a' });
    const b = plain({ ...defaultProtocol(START), id: 'b' });
    const c = plain({ ...defaultProtocol('2026-12-01'), id: 'c' });
    expect(sanitizeProtocols([a, b, c]).map((p) => p.id)).toEqual(['b', 'c']);
  });

  it('recusa metas fora da faixa e refeições repetidas', () => {
    const p = plain(defaultProtocol(START));
    expect(() => sanitizeProtocols([{ ...p, targets: { ...p.targets, kcal: 500 } }])).toThrow(/calorias/);
    expect(() => sanitizeProtocols([{ ...p, meals: [p.meals[0], p.meals[0]] }])).toThrow(/repetidos/);
    expect(() => sanitizeProtocols([])).toThrow();
  });
});

describe('servidor · dia e configurações', () => {
  it('aceita ids de refeição definidos pelo protocolo', () => {
    const d = sanitizeDay({ meals: { ceia: { status: 'planned', kcal: 100, p: 1, c: 1, f: 1 }, 'BAD ID': { status: 'planned' } }, extras: [], exercises: [] });
    expect(Object.keys(d.meals)).toEqual(['ceia']);
  });

  it('guarda quantidades por item e o horário em que comeu', () => {
    const d = sanitizeDay({
      meals: {
        almoco: {
          status: 'less',
          kcal: 500,
          p: 40,
          c: 50,
          f: 10,
          time: '14:05',
          portions: [{ i: 2, food: 'feijao', grams: 0 }, { i: 0, mult: 0.5 }, { i: 99, grams: 1 }, { i: 1 }],
          items: [{ name: 'Refrigerante comum · 1 copo (250 ml)', qty: 1, kcal: 106, p: 0, c: 27, f: 0 }],
        },
        lanche: { status: 'planned', kcal: 300, p: 1, c: 1, f: 1, time: '25:00' },
      },
      extras: [],
      exercises: [],
    });
    expect(d.meals.almoco.time).toBe('14:05');
    expect(d.meals.almoco.portions).toEqual([{ i: 2, food: 'feijao', grams: 0 }, { i: 0, mult: 0.5 }]);
    expect(d.meals.almoco.items).toHaveLength(1);
    expect(d.meals.lanche.time).toBeUndefined();
  });

  it('configurações novas só com a data; as antigas continuam aceitas', () => {
    expect(sanitizeSettings({ startDate: START })).toEqual({ startDate: START });
    const legacy = sanitizeSettings({ startDate: START, targets: [{ from: START, kcal: 2250, p: 190, c: 240, f: 55, steps: 10000 }], spinDays: [2, 3] });
    expect(legacy.targets).toHaveLength(1);
    expect(legacy.spinDays).toEqual([2, 3]);
  });

  it('backup completo passa inteiro pela validação', () => {
    const state = {
      version: 2,
      profile: { heightCm: 186, age: 31, sex: 'M' },
      settings: { startDate: START },
      protocols: [plain(defaultProtocol(START))],
      days: { [START]: { meals: { cafe: { status: 'planned', kcal: 500, p: 40, c: 50, f: 12, at: 'x' } }, extras: [], exercises: [] } },
      measurements: [{ id: 'm1', date: START, time: '06:00', fasting: true, weight: 106 }],
      compensation: null,
    };
    const out = sanitizeState(state);
    expect(out.protocols).toEqual(state.protocols);
    expect(out.days[START].meals.cafe.kcal).toBe(500);
    expect(() => sanitizeState({ tipo: 'protocolo-30/exportacao' })).toThrow(/backup/);
  });
});
