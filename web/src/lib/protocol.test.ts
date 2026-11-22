import { describe, expect, it } from 'vitest';
import { emptyDay, makeMealLog } from './engine';
import { buildAiExport } from './export';
import { FOOD_BY_ID } from './foods';
import { planOf } from './plan';
import {
  completeProtocol,
  defaultProtocol,
  diffProtocols,
  editFrom,
  extractJson,
  mergeProtocol,
  migrateLegacy,
  parseProtocolInput,
  protocolFor,
  toProtocolFile,
  upsertVersion,
  validateProtocol,
} from './protocol';
import type { AppState, LegacySettings, Protocol } from './types';

const START = '2026-11-23';
const ctx = { today: '2026-11-22', startDate: START, weightKg: 106 };

/** Conteúdo comparável de uma versão (sem id, nome, datas e origem). */
const body = (p: Protocol) => {
  const { id: _i, name: _n, from: _f, createdAt: _c, source: _s, notes: _o, ...rest } = p;
  return JSON.parse(JSON.stringify(rest));
};

describe('protocolo padrão', () => {
  it('é válido e sem avisos', () => {
    const p = defaultProtocol(START);
    const c = validateProtocol(p, ctx);
    expect(c.errors).toEqual([]);
    expect(c.warnings).toEqual([]);
    expect(c.menuKcal).toBe(2253);
  });
});

describe('versões', () => {
  const v1 = defaultProtocol(START);
  const v2 = { ...defaultProtocol('2026-12-01'), id: 'v2' };
  const list = upsertVersion([v1], v2);

  it('acha a versão em vigor por data (antes da primeira, vale a primeira)', () => {
    expect(protocolFor(list, '2026-11-01').id).toBe('v1');
    expect(protocolFor(list, '2026-11-30').id).toBe('v1');
    expect(protocolFor(list, '2026-12-01').id).toBe('v2');
    expect(protocolFor(list, '2027-01-10').id).toBe('v2');
  });

  it('substitui a versão que começa no mesmo dia', () => {
    const again = upsertVersion(list, { ...defaultProtocol('2026-12-01'), id: 'v3' });
    expect(again.map((p) => p.id)).toEqual(['v1', 'v3']);
  });

  it('edita no lugar a versão em vigor e as seguintes', () => {
    const out = editFrom(list, '2026-11-25', (p) => {
      p.training.intervalsFrom = '2026-12-09';
    });
    expect(out.map((p) => p.training.intervalsFrom)).toEqual(['2026-12-09', '2026-12-09']);
    const later = editFrom(list, '2026-12-02', (p) => {
      p.training.intervalsFrom = '2026-12-09';
    });
    expect(later.map((p) => p.training.intervalsFrom)).toEqual([null, '2026-12-09']);
  });
});

describe('migração do formato antigo', () => {
  it('vira uma versão por período de meta, mantendo agenda e limites', () => {
    const legacy: LegacySettings = {
      startDate: START,
      targets: [
        { from: START, kcal: 2250, p: 190, c: 240, f: 55, steps: 10000 },
        { from: '2026-12-07', kcal: 2100, p: 190, c: 200, f: 55, steps: 12000 },
      ],
      exerciseTargets: { z2: 260 },
      creditFactor: 0.8,
      spinDays: [1, 3, 5],
      hardDay: 5,
      intervalsFrom: '2026-12-11',
    };
    const out = migrateLegacy(legacy, START);
    expect(out.map((p) => p.from)).toEqual([START, '2026-12-07']);
    expect(out[1].targets.kcal).toBe(2100);
    expect(out.every((p) => p.training.spinDays.join() === '1,3,5' && p.training.hardDay === 5)).toBe(true);
    expect(out[0].training.exerciseTargets.z2).toBe(260);
    expect(out[0].training.exerciseTargets.tempo).toBe(280);
    expect(out[0].bank.creditFactor).toBe(0.8);
    expect(out[0].training.intervalsFrom).toBe('2026-12-11');
    expect(out[0].meals.length).toBe(5);
  });

  it('sem configuração, usa o padrão', () => {
    expect(migrateLegacy(null, START)).toHaveLength(1);
  });

  it('completa versões salvas sem campos novos', () => {
    const p = completeProtocol({ from: START, id: 'x', targets: { kcal: 2000, p: 180, c: 200, f: 60, steps: 9000 } } as Protocol);
    expect(p.meals.length).toBe(5);
    expect(p.training.sessions.z2.name).toBe('Z2 30');
    expect(p.bank.foodFloor).toBe(1950);
    expect(p.targets.kcal).toBe(2000);
  });
});

describe('arquivo de protocolo', () => {
  const base = defaultProtocol(START);

  it('ida e volta sem mudanças', () => {
    const text = JSON.stringify(toProtocolFile(base));
    const parsed = parseProtocolInput(text);
    const next = mergeProtocol(base, parsed, '2026-12-01');
    expect(body(next)).toEqual(body(base));
    expect(diffProtocols(base, next)).toEqual([]);
  });

  it('acha o JSON dentro da resposta da IA (bloco ```json)', () => {
    const reply = 'Claro! Aqui está:\n\n```json\n{"tipo":"protocolo-30/protocolo","aPartirDe":"2026-12-01","protocolo":{"targets":{"kcal":2100}}}\n```\nQualquer dúvida…';
    const p = parseProtocolInput(reply);
    expect(p.from).toBe('2026-12-01');
    expect(p.patch).toEqual({ targets: { kcal: 2100 } });
    expect(extractJson('texto {"a": 1} fim')).toEqual({ a: 1 });
  });

  it('arquivo parcial muda só o que veio e aceita nomes em português', () => {
    const p = parseProtocolInput(JSON.stringify({ nome: 'Ajuste', metas: { calorias: 2150, passos: 12000 }, treino: { spinDays: [2, 4, 6] } }));
    const next = mergeProtocol(base, p, '2026-12-01');
    expect(next.targets).toEqual({ ...base.targets, kcal: 2150, steps: 12000 });
    expect(next.training.spinDays).toEqual([2, 4, 6]);
    expect(next.training.liftDays).toEqual(base.training.liftDays);
    expect(next.meals).toEqual(base.meals);
    expect(next.name).toBe('Ajuste');
    const lines = diffProtocols(base, next).flatMap((s) => s.lines);
    expect(lines).toContain('Calorias: 2.253 → 2.150');
    expect(lines.some((l) => l.startsWith('Spinning:'))).toBe(true);
  });

  it('cardápio novo com alimento novo e item com macros próprios', () => {
    const p = parseProtocolInput(
      JSON.stringify({
        protocolo: {
          foods: [{ id: 'tapioca', name: 'Tapioca (goma hidratada)', per100: { kcal: 240, p: 0, c: 60, f: 0 } }],
          meals: [
            { id: 'cafe', name: 'Café', time: '06:15', items: [{ food: 'tapioca', grams: 100 }, { food: 'ovo', grams: 150 }] },
            { id: 'almoco', name: 'Almoço', time: '12:30', items: [{ label: 'Marmita fit', kcal: 600, p: 45, c: 60, f: 15 }] },
          ],
        },
      }),
    );
    const next = mergeProtocol(base, p, '2026-12-01');
    const plan = planOf(next);
    expect(plan.meals.map((m) => m.id)).toEqual(['cafe', 'almoco']);
    expect(plan.kcal).toBe(Math.round(240 + (FOOD_BY_ID.ovo.per100.kcal * 150) / 100 + 600));
    const check = validateProtocol(next, ctx);
    expect(check.errors).toEqual([]);
    // cardápio bem abaixo da meta: avisa
    expect(check.warnings.some((w) => w.includes('O cardápio soma') && w.includes('sobram'))).toBe(true);
  });

  it('acusa erro em alimento desconhecido, horário inválido e meta absurda', () => {
    const p = parseProtocolInput(
      JSON.stringify({ protocolo: { targets: { kcal: 800 }, meals: [{ id: 'x', name: 'X', time: '25:00', items: [{ food: 'nao_existe', grams: 100 }] }] } }),
    );
    const next = mergeProtocol(base, p, '2026-12-01');
    const { errors } = validateProtocol(next, ctx);
    expect(errors.some((e) => e.includes('calorias fora da faixa'))).toBe(true);
    expect(errors.some((e) => e.includes('horário inválido'))).toBe(true);
    expect(errors.some((e) => e.includes('"nao_existe" não existe'))).toBe(true);
  });

  it('recusa conteúdo que não é protocolo', () => {
    expect(() => parseProtocolInput('olá')).toThrow();
    expect(() => parseProtocolInput('{"qualquer": 1}')).toThrow(/Não achei nenhuma seção/);
  });
});

describe('exportação para IA', () => {
  function stateWithData(): AppState {
    const proto = defaultProtocol(START);
    const plan = planOf(proto);
    const day = emptyDay();
    day.meals.almoco = makeMealLog(plan, plan.mealById.almoco, 'more', { items: [{ name: 'Refrigerante', kcal: 140, p: 0, c: 35, f: 0 }] });
    day.exercises.push({ id: 'e1', kind: 'musculacao', status: 'done', plannedKey: 'lift', activeKcal: 300, avgHr: 118, rpe: 7, at: '' });
    day.steps = 8000;
    return {
      version: 2,
      profile: { name: 'Teste', heightCm: 180, age: 30, sex: 'M' },
      settings: { startDate: START },
      protocols: [proto],
      days: { [START]: day, '2026-11-24': emptyDay() },
      measurements: [{ id: 'm', date: START, time: '06:00', fasting: true, weight: 100, waistNavel: 100, neck: 40 }],
      compensation: null,
      updatedAt: '',
    };
  }

  it('traz prompt, protocolo importável e os dias com saldo', () => {
    const s = stateWithData();
    const exp = buildAiExport(s, '2026-11-25', 12 * 60);
    const data = JSON.parse(exp.json);
    expect(data.tipo).toBe('protocolo-30/exportacao');
    expect(data.prompt).toContain('Protocolo 30');
    expect(data.dias.map((d: { data: string }) => d.data)).toEqual([START, '2026-11-24', '2026-11-25']);
    const d1 = data.dias[0];
    expect(d1.refeicoes.find((r: { id: string }) => r.id === 'almoco').registro).toBe('a_mais');
    expect(d1.treinos[0]).toMatchObject({ planejado: 'Musculação · pernas', situacao: 'feito', kcalAtivas: 300, metaKcalAtivas: 280, desvioKcal: 20 });
    expect(d1.banco.comida).toBe(-140);
    expect(data.medidas[0]).toMatchObject({ pesoKg: 100, cinturaUmbigoCm: 100 });
    expect(data.alimentosDisponiveis.length).toBeGreaterThan(30);
    // o arquivo inteiro pode ser subido em "Atualizar protocolo": usa protocoloAtual
    const parsed = parseProtocolInput(exp.json);
    const next = mergeProtocol(s.protocols[0], parsed, '2026-11-26');
    expect(diffProtocols(s.protocols[0], next)).toEqual([]);
    // o modelo de atualização também é um protocolo parcial válido
    const tpl = parseProtocolInput(JSON.stringify(data.formatoDeAtualizacao));
    expect(Object.keys(tpl.patch).sort()).toEqual(['bank', 'foods', 'meals', 'targets', 'training']);
  });
});
