import { fmtShort, isISODate, weekdayShort } from './dates';
import { foodIndex } from './foods';
import { DEFAULT_LADDER, DEFAULT_MEALS, DEFAULT_SUBSTITUTIONS, DEFAULT_TOTALS, mealsTotalsWith } from './plan';
import { DEFAULT_SESSIONS, DEFAULT_START, defaultTraining, scheduleWarnings } from './schedule';
import type {
  BankParams,
  DailyTargets,
  LadderStep,
  LegacySettings,
  ProtoFood,
  ProtoItem,
  ProtoMeal,
  Protocol,
  SessionTemplate,
  SpinTemplate,
  SubstitutionRow,
  TargetKey,
  Totals,
  Training,
} from './types';
import { SPIN_KEYS, TARGET_KEYS } from './types';

export const FILE_TYPE = 'protocolo-30/protocolo';
export const EXPORT_TYPE = 'protocolo-30/exportacao';

export const DEFAULT_BANK: BankParams = { creditFactor: 0.75, maxFoodCut: 300, foodFloor: 1950, maxExtraActive: 300, autoCalibrate: true };

export function newId(): string {
  return `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

export function defaultProtocol(from = DEFAULT_START): Protocol {
  return {
    id: 'v1',
    name: 'Plano inicial (30 dias)',
    from,
    createdAt: new Date().toISOString(),
    source: 'padrao',
    targets: {
      kcal: Math.round(DEFAULT_TOTALS.kcal),
      p: Math.round(DEFAULT_TOTALS.p),
      c: Math.round(DEFAULT_TOTALS.c),
      f: Math.round(DEFAULT_TOTALS.f),
      steps: 10000,
    },
    meals: structuredClone(DEFAULT_MEALS),
    foods: [],
    training: defaultTraining(),
    bank: { ...DEFAULT_BANK },
    reductionLadder: structuredClone(DEFAULT_LADDER),
    substitutions: structuredClone(DEFAULT_SUBSTITUTIONS),
  };
}

/** Preenche campos ausentes com os valores padrão (versões salvas por builds antigos ou arquivos parciais). */
export function completeProtocol(p: Partial<Protocol> & { from: string }): Protocol {
  const d = defaultProtocol(p.from);
  const tr: Partial<Training> = p.training ?? {};
  return {
    ...d,
    ...p,
    id: p.id || newId(),
    name: p.name || d.name,
    createdAt: p.createdAt || d.createdAt,
    source: p.source ?? 'padrao',
    targets: { ...d.targets, ...(p.targets ?? {}) },
    meals: Array.isArray(p.meals) && p.meals.length ? p.meals : d.meals,
    foods: Array.isArray(p.foods) ? p.foods : [],
    training: {
      ...d.training,
      ...tr,
      exerciseTargets: { ...d.training.exerciseTargets, ...(tr.exerciseTargets ?? {}) },
      sessions: { ...d.training.sessions, ...(tr.sessions ?? {}) },
      zones: Array.isArray(tr.zones) && tr.zones.length ? tr.zones : d.training.zones,
    },
    bank: { ...d.bank, ...(p.bank ?? {}) },
    reductionLadder: Array.isArray(p.reductionLadder) ? p.reductionLadder : d.reductionLadder,
    substitutions: {
      carbs: p.substitutions?.carbs ?? d.substitutions.carbs,
      proteins: p.substitutions?.proteins ?? d.substitutions.proteins,
    },
  };
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isDays = (v: unknown): v is number[] => Array.isArray(v) && v.every((d) => Number.isInteger(d) && d >= 0 && d <= 6);
const isTime = (v: unknown): v is string => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);

/** Converte as configurações antigas (antes do protocolo versionado) em versões de protocolo. */
export function migrateLegacy(s: LegacySettings | null, startDate: string): Protocol[] {
  const base = defaultProtocol(startDate);
  if (!s) return [base];
  base.source = 'migracao';
  const t = base.training;
  if (isDays(s.liftDays)) t.liftDays = s.liftDays;
  if (isDays(s.legDays)) t.legDays = s.legDays;
  if (isDays(s.spinDays)) t.spinDays = s.spinDays;
  if (Number.isInteger(s.hardDay)) t.hardDay = s.hardDay!;
  if (isTime(s.spinTime)) t.spinTime = s.spinTime;
  if (isTime(s.liftTime)) t.liftTime = s.liftTime;
  if (s.intervalsFrom === null || isISODate(s.intervalsFrom)) t.intervalsFrom = s.intervalsFrom ?? null;
  if (s.exerciseTargets) {
    for (const k of TARGET_KEYS) if (isNum(s.exerciseTargets[k])) t.exerciseTargets[k] = s.exerciseTargets[k]!;
  }
  const b = base.bank;
  if (isNum(s.creditFactor)) b.creditFactor = s.creditFactor;
  if (isNum(s.maxFoodCut)) b.maxFoodCut = s.maxFoodCut;
  if (isNum(s.foodFloor)) b.foodFloor = s.foodFloor;
  if (isNum(s.maxExtraActive)) b.maxExtraActive = s.maxExtraActive;
  if (typeof s.autoCalibrate === 'boolean') b.autoCalibrate = s.autoCalibrate;
  const periods = (s.targets ?? []).filter((p) => isISODate(p.from)).sort((x, y) => x.from.localeCompare(y.from));
  if (!periods.length) return [base];
  return periods.map((p, i) => ({
    ...structuredClone(base),
    id: `v${i + 1}`,
    name: i === 0 ? base.name : `Ajuste de metas (${fmtShort(p.from)})`,
    from: p.from,
    targets: { kcal: p.kcal, p: p.p, c: p.c, f: p.f, steps: p.steps },
  }));
}

export function sortProtocols(list: Protocol[]): Protocol[] {
  return [...list].sort((a, b) => a.from.localeCompare(b.from));
}

/** Versão do protocolo em vigor numa data (antes da primeira versão, vale a primeira). */
export function protocolFor(list: Protocol[], date: string): Protocol {
  const sorted = sortProtocols(list);
  let p = sorted[0];
  for (const x of sorted) if (x.from <= date) p = x;
  return p;
}

/** Insere uma versão; se já existir outra com a mesma data de início, ela é substituída. */
export function upsertVersion(list: Protocol[], v: Protocol): Protocol[] {
  return sortProtocols([...list.filter((x) => x.from !== v.from), v]);
}

/** Edita no lugar a versão em vigor em `from` e as seguintes (para mudanças que já trazem a própria data). */
export function editFrom(list: Protocol[], from: string, fn: (p: Protocol) => void): Protocol[] {
  const cur = protocolFor(list, from);
  return sortProtocols(
    list.map((p) => {
      if (p.from < cur.from) return p;
      const c = structuredClone(p);
      fn(c);
      return c;
    }),
  );
}

/** Impressão digital curta do conteúdo de uma versão (para saber quando ela mudou). */
export function protocolKey(p: Protocol): string {
  const str = JSON.stringify(p);
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return `${p.id}:${(h >>> 0).toString(36)}`;
}

/** Data de início padrão para uma nova versão: hoje, ou o dia 1 se o protocolo ainda não começou. */
export function defaultFrom(today: string, startDate: string): string {
  return today < startDate ? startDate : today;
}

/* ------------------------------------------------------------ arquivo .json */

export interface ProtocolFile {
  tipo: string;
  versao: 1;
  nome: string;
  aPartirDe: string;
  observacoes: string;
  protocolo: Pick<Protocol, 'targets' | 'meals' | 'foods' | 'training' | 'bank' | 'reductionLadder' | 'substitutions'>;
}

export function toProtocolFile(p: Protocol): ProtocolFile {
  return {
    tipo: FILE_TYPE,
    versao: 1,
    nome: p.name,
    aPartirDe: p.from,
    observacoes: p.notes ?? '',
    protocolo: {
      targets: p.targets,
      meals: p.meals,
      foods: p.foods,
      training: p.training,
      bank: p.bank,
      reductionLadder: p.reductionLadder,
      substitutions: p.substitutions,
    },
  };
}

export interface ParsedProtocol {
  name?: string;
  from?: string;
  notes?: string;
  patch: Record<string, unknown>;
}

/** Acha o JSON num texto (aceita ```json … ``` e texto antes/depois, como as IAs costumam responder). */
export function extractJson(text: string): unknown {
  const clean = text.replace(/^﻿/, '').trim();
  const tries: string[] = [clean];
  const fence = clean.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) tries.push(fence[1].trim());
  const first = clean.indexOf('{');
  const last = clean.lastIndexOf('}');
  if (first >= 0 && last > first) tries.push(clean.slice(first, last + 1));
  for (const t of tries) {
    try {
      return JSON.parse(t);
    } catch {
      /* tenta o próximo */
    }
  }
  throw new Error('Não encontrei um JSON válido. Envie o arquivo .json ou cole o texto completo, começando em { e terminando em }.');
}

const SECTION_ALIASES: Record<string, string> = {
  targets: 'targets',
  metas: 'targets',
  meals: 'meals',
  refeicoes: 'meals',
  'refeições': 'meals',
  cardapio: 'meals',
  'cardápio': 'meals',
  foods: 'foods',
  alimentos: 'foods',
  training: 'training',
  treino: 'training',
  treinos: 'training',
  bank: 'bank',
  banco: 'bank',
  reductionLadder: 'reductionLadder',
  ordemDeCortes: 'reductionLadder',
  substitutions: 'substitutions',
  substituicoes: 'substitutions',
  'substituições': 'substitutions',
};

function pickSections(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = SECTION_ALIASES[k];
    if (key) out[key] = v;
  }
  return out;
}

/** Lê um arquivo de protocolo (completo ou parcial), um export do app ou um objeto de protocolo solto. */
export function parseProtocolInput(text: string): ParsedProtocol {
  let obj = extractJson(text);
  if (!isObj(obj)) throw new Error('O conteúdo precisa ser um objeto JSON ({ … }).');
  if (obj.tipo === EXPORT_TYPE && isObj(obj.protocoloAtual)) obj = obj.protocoloAtual;
  const o = obj as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
  const inner = isObj(o.protocolo) ? o.protocolo : isObj(o.protocol) ? o.protocol : o;
  const patch = pickSections(inner);
  if (!Object.keys(patch).length) {
    throw new Error('Não achei nenhuma seção de protocolo (targets, meals, foods, training, bank…). Confira se é o arquivo certo.');
  }
  const from = str(o.aPartirDe) ?? str(o.from) ?? str(o.validoAPartirDe);
  return { name: str(o.nome) ?? str(o.name), from: from && isISODate(from) ? from : undefined, notes: str(o.observacoes) ?? str(o.notes), patch };
}

/* -------------------------------------------------------------- mesclagem */

function slug(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 30) || 'refeicao'
  );
}

function pick<T>(o: Record<string, unknown>, ...keys: string[]): T | undefined {
  for (const k of keys) if (o[k] !== undefined) return o[k] as T;
  return undefined;
}

function normItem(raw: unknown): ProtoItem {
  const o = isObj(raw) ? raw : {};
  const item: ProtoItem = {};
  const food = pick<string>(o, 'food', 'alimento');
  const grams = pick<number>(o, 'grams', 'gramas', 'g');
  const label = pick<string>(o, 'label', 'rotulo', 'rótulo', 'nome', 'name');
  const free = pick<string>(o, 'free', 'livre');
  if (typeof food === 'string' && food) item.food = food;
  if (isNum(grams)) item.grams = grams;
  if (typeof label === 'string' && label) item.label = label;
  if (typeof free === 'string' && free) item.free = free;
  const macros: [keyof Totals, string[]][] = [
    ['kcal', ['kcal', 'calorias']],
    ['p', ['p', 'proteina', 'proteína']],
    ['c', ['c', 'carboidrato', 'carbo']],
    ['f', ['f', 'gordura']],
  ];
  for (const [k, aliases] of macros) {
    const v = pick<number>(o, ...aliases);
    if (isNum(v)) item[k] = v;
  }
  return item;
}

function normMeal(raw: unknown, i: number): ProtoMeal {
  const o = isObj(raw) ? raw : {};
  const name = String(pick<string>(o, 'name', 'nome') ?? `Refeição ${i + 1}`);
  const items = pick<unknown[]>(o, 'items', 'itens');
  return {
    id: String(pick<string>(o, 'id') ?? slug(name)),
    name,
    short: pick<string>(o, 'short', 'curto', 'nomeCurto') ?? undefined,
    time: String(pick<string>(o, 'time', 'horario', 'horário') ?? ''),
    hint: pick<string>(o, 'hint', 'descricao', 'descrição') ?? undefined,
    items: Array.isArray(items) ? items.map(normItem) : [],
  };
}

function normFood(raw: unknown): ProtoFood | null {
  if (!isObj(raw)) return null;
  const per = isObj(raw.per100) ? raw.per100 : isObj(raw.por100g) ? raw.por100g : null;
  const id = pick<string>(raw, 'id');
  const name = pick<string>(raw, 'name', 'nome');
  if (!per || typeof id !== 'string' || typeof name !== 'string') return null;
  const n = (v: unknown) => (isNum(v) ? v : 0);
  const unitRaw = isObj(raw.unit) ? raw.unit : isObj(raw.unidade) ? raw.unidade : null;
  return {
    id,
    name,
    group: pick<string>(raw, 'group', 'grupo'),
    per100: { kcal: n(per.kcal ?? per.calorias), p: n(per.p ?? per.proteina), c: n(per.c ?? per.carboidrato), f: n(per.f ?? per.gordura ?? per.g) },
    unit:
      unitRaw && typeof (unitRaw.label ?? unitRaw.nome) === 'string' && isNum(unitRaw.grams ?? unitRaw.gramas)
        ? { label: String(unitRaw.label ?? unitRaw.nome), grams: Number(unitRaw.grams ?? unitRaw.gramas) }
        : undefined,
    source: pick<string>(raw, 'source', 'fonte'),
  };
}

function mergeTargets(base: DailyTargets, raw: unknown): DailyTargets {
  if (!isObj(raw)) return base;
  const out = { ...base };
  const map: [keyof DailyTargets, string[]][] = [
    ['kcal', ['kcal', 'calorias']],
    ['p', ['p', 'proteina', 'proteína']],
    ['c', ['c', 'carboidrato', 'carbo']],
    ['f', ['f', 'gordura']],
    ['steps', ['steps', 'passos']],
  ];
  for (const [k, aliases] of map) {
    const v = pick<number>(raw, ...aliases);
    if (isNum(v)) out[k] = v;
  }
  return out;
}

function mergeTraining(base: Training, raw: unknown): Training {
  if (!isObj(raw)) return base;
  const t = structuredClone(base);
  if (isDays(raw.liftDays)) t.liftDays = [...raw.liftDays].sort();
  if (isDays(raw.legDays)) t.legDays = [...raw.legDays].sort();
  if (isDays(raw.spinDays)) t.spinDays = [...raw.spinDays].sort();
  if (Number.isInteger(raw.hardDay)) t.hardDay = raw.hardDay as number;
  if (isTime(raw.spinTime)) t.spinTime = raw.spinTime;
  if (isTime(raw.liftTime)) t.liftTime = raw.liftTime;
  if (raw.intervalsFrom === null || isISODate(raw.intervalsFrom)) t.intervalsFrom = (raw.intervalsFrom as string | null) ?? null;
  if (typeof raw.liftDetail === 'string') t.liftDetail = raw.liftDetail;
  if (isObj(raw.exerciseTargets)) {
    for (const k of TARGET_KEYS) {
      const v = raw.exerciseTargets[k];
      if (isNum(v)) t.exerciseTargets[k as TargetKey] = v;
    }
  }
  if (isObj(raw.sessions)) {
    for (const k of SPIN_KEYS) {
      const s = raw.sessions[k];
      if (!isObj(s)) continue;
      const cur: SessionTemplate = t.sessions[k as SpinTemplate] ?? DEFAULT_SESSIONS[k as SpinTemplate];
      t.sessions[k as SpinTemplate] = {
        name: typeof s.name === 'string' ? s.name : cur.name,
        zone: typeof s.zone === 'string' ? s.zone : cur.zone,
        hr: typeof s.hr === 'string' ? s.hr : cur.hr,
        rpe: typeof s.rpe === 'string' ? s.rpe : cur.rpe,
        blocks: Array.isArray(s.blocks) ? s.blocks.filter((b): b is string => typeof b === 'string') : cur.blocks,
      };
    }
  }
  if (Array.isArray(raw.zones)) {
    const zones = raw.zones
      .filter(isObj)
      .filter((z) => isNum(z.z) && typeof z.range === 'string')
      .map((z) => ({ z: z.z as number, range: z.range as string, use: typeof z.use === 'string' ? z.use : '' }));
    if (zones.length) t.zones = zones;
  }
  return t;
}

function mergeBank(base: BankParams, raw: unknown): BankParams {
  if (!isObj(raw)) return base;
  const b = { ...base };
  for (const k of ['creditFactor', 'maxFoodCut', 'foodFloor', 'maxExtraActive'] as const) if (isNum(raw[k])) b[k] = raw[k] as number;
  if (typeof raw.autoCalibrate === 'boolean') b.autoCalibrate = raw.autoCalibrate;
  return b;
}

function normLadder(raw: unknown): LadderStep[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  return raw
    .filter(isObj)
    .filter((s) => typeof s.meal === 'string' && typeof s.food === 'string' && isNum(s.from) && isNum(s.to))
    .map((s) => ({ meal: s.meal as string, food: s.food as string, from: s.from as number, to: s.to as number }));
}

function normSubs(raw: unknown): SubstitutionRow[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  return raw
    .filter(isObj)
    .filter((r) => typeof r.food === 'string')
    .map((r) => ({ food: r.food as string, qty: String(r.qty ?? ''), kcal: isNum(r.kcal) ? r.kcal : 0 }));
}

/** Cria uma nova versão a partir da atual + o que veio no arquivo (seções ausentes continuam iguais). */
export function mergeProtocol(base: Protocol, parsed: ParsedProtocol, from: string, source: Protocol['source'] = 'arquivo'): Protocol {
  const p = parsed.patch;
  const next: Protocol = structuredClone(base);
  next.id = newId();
  next.createdAt = new Date().toISOString();
  next.source = source;
  next.from = from;
  next.name = parsed.name ?? `Atualização de ${fmtShort(from)}`;
  next.notes = parsed.notes;
  if (p.targets !== undefined) next.targets = mergeTargets(next.targets, p.targets);
  if (Array.isArray(p.meals)) next.meals = p.meals.map(normMeal);
  if (Array.isArray(p.foods)) {
    const byId = new Map(next.foods.map((f) => [f.id, f]));
    for (const raw of p.foods) {
      const f = normFood(raw);
      if (f) byId.set(f.id, f);
    }
    next.foods = [...byId.values()];
  }
  if (p.training !== undefined) next.training = mergeTraining(next.training, p.training);
  if (p.bank !== undefined) next.bank = mergeBank(next.bank, p.bank);
  const ladder = normLadder(p.reductionLadder);
  if (ladder) next.reductionLadder = ladder;
  if (isObj(p.substitutions)) {
    const carbs = normSubs(p.substitutions.carbs ?? p.substitutions.carboidratos);
    const proteins = normSubs(p.substitutions.proteins ?? p.substitutions.proteinas);
    if (carbs) next.substitutions.carbs = carbs;
    if (proteins) next.substitutions.proteins = proteins;
  }
  return next;
}

/* -------------------------------------------------------------- validação */

export interface ProtocolCheck {
  errors: string[];
  warnings: string[];
  menuKcal: number;
}

const inRange = (v: number, a: number, b: number) => isNum(v) && v >= a && v <= b;

export function validateProtocol(p: Protocol, ctx: { today: string; startDate: string; weightKg?: number }): ProtocolCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  const t = p.targets;
  if (!isISODate(p.from)) errors.push('A data de início ("aPartirDe") é inválida. Use o formato AAAA-MM-DD.');
  else if (p.from < ctx.today && p.from >= ctx.startDate) {
    warnings.push(`A versão começa em ${fmtShort(p.from)}, no passado: os dias desde então serão recalculados com o novo protocolo.`);
  }
  if (!inRange(t.kcal, 1200, 6000)) errors.push('Meta de calorias fora da faixa aceita (1.200–6.000 kcal).');
  else if (t.kcal < 1900) warnings.push(`Meta de ${t.kcal} kcal está abaixo de ~1.900 kcal: só com acompanhamento profissional, já que você treina duas vezes por dia.`);
  if (!inRange(t.p, 50, 400)) errors.push('Meta de proteína fora da faixa aceita (50–400 g).');
  else if (ctx.weightKg && t.p / ctx.weightKg < 1.6) warnings.push(`Proteína de ${t.p} g = ${(t.p / ctx.weightKg).toFixed(1).replace('.', ',')} g/kg, abaixo do mínimo de 1,6 g/kg para preservar músculo.`);
  if (!inRange(t.c, 0, 800)) errors.push('Meta de carboidrato fora da faixa aceita (0–800 g).');
  if (!inRange(t.f, 20, 300)) errors.push('Meta de gordura fora da faixa aceita (20–300 g).');
  if (!inRange(t.steps, 0, 40000)) errors.push('Meta de passos fora da faixa aceita (0–40.000).');

  const foods = foodIndex(p.foods);
  if (!p.meals.length) errors.push('O cardápio precisa de pelo menos uma refeição.');
  if (p.meals.length > 12) errors.push('O cardápio aceita no máximo 12 refeições.');
  const ids = new Set<string>();
  for (const m of p.meals) {
    const where = `Refeição "${m.name}"`;
    if (!/^[a-z0-9_-]{1,30}$/.test(m.id)) errors.push(`${where}: id inválido ("${m.id}"). Use letras minúsculas, números, - ou _.`);
    if (ids.has(m.id)) errors.push(`${where}: id repetido ("${m.id}").`);
    ids.add(m.id);
    if (!isTime(m.time)) errors.push(`${where}: horário inválido ("${m.time}"). Use HH:MM.`);
    if (!m.items.length) errors.push(`${where}: sem itens.`);
    if (m.items.length > 30) errors.push(`${where}: no máximo 30 itens.`);
    for (const it of m.items) {
      if (it.food) {
        if (!foods[it.food] && !isNum(it.kcal)) {
          errors.push(`${where}: o alimento "${it.food}" não existe na tabela. Inclua-o em "foods" (com valores por 100 g) ou informe kcal, p, c e f no item.`);
        }
        if (!isNum(it.grams) || it.grams <= 0 || it.grams > 5000) errors.push(`${where}: "${it.food}" precisa de gramas entre 1 e 5.000.`);
      } else if (!it.free && !it.label) {
        errors.push(`${where}: há um item sem alimento, sem nome e sem descrição.`);
      }
      for (const k of ['kcal', 'p', 'c', 'f'] as const) {
        const v = it[k];
        if (v !== undefined && !inRange(v, 0, 5000)) errors.push(`${where}: valor de ${k} inválido em "${it.label ?? it.food ?? it.free}".`);
      }
    }
  }
  for (const f of p.foods) {
    if (!/^[a-z0-9_-]{1,40}$/.test(f.id)) errors.push(`Alimento "${f.name}": id inválido ("${f.id}").`);
    if (!inRange(f.per100.kcal, 0, 950)) errors.push(`Alimento "${f.name}": kcal por 100 g fora da faixa (0–950).`);
  }
  const menuKcal = Math.round(mealsTotalsWith(foods, p.meals).kcal);
  if (p.meals.length && Math.abs(menuKcal - t.kcal) > 100) {
    const diff = t.kcal - menuKcal;
    warnings.push(
      diff < 0
        ? `O cardápio soma ${n(menuKcal)} kcal e a meta é ${n(t.kcal)} kcal: o app vai mostrar cortes diários de ${n(-diff)} kcal para fechar a meta.`
        : `O cardápio soma ${n(menuKcal)} kcal e a meta é ${n(t.kcal)} kcal: seguindo só o cardápio, sobram ${n(diff)} kcal por dia (crédito no banco).`,
    );
  }

  const tr = p.training;
  if (!isDays(tr.liftDays) || !isDays(tr.legDays) || !isDays(tr.spinDays)) errors.push('Dias de treino devem ser números de 0 (domingo) a 6 (sábado).');
  if (!Number.isInteger(tr.hardDay) || tr.hardDay < 0 || tr.hardDay > 6) errors.push('O dia da sessão forte deve ser de 0 a 6.');
  if (!isTime(tr.spinTime) || !isTime(tr.liftTime)) errors.push('Horários de treino devem estar no formato HH:MM.');
  if (tr.intervalsFrom !== null && !isISODate(tr.intervalsFrom)) errors.push('A data de liberação do intervalado é inválida.');
  for (const k of TARGET_KEYS) if (!inRange(tr.exerciseTargets[k], 0, 3000)) errors.push(`Meta de calorias ativas inválida para "${k}".`);
  warnings.push(...scheduleWarnings(tr));

  const b = p.bank;
  if (!inRange(b.creditFactor, 0.3, 1)) errors.push('O fator de crédito deve ficar entre 0,3 e 1.');
  if (!inRange(b.maxFoodCut, 0, 800)) errors.push('O corte máximo de comida deve ficar entre 0 e 800 kcal.');
  if (!inRange(b.foodFloor, 1200, 4000)) errors.push('O piso de calorias deve ficar entre 1.200 e 4.000 kcal.');
  else if (b.foodFloor < 1800) warnings.push(`Piso de ${b.foodFloor} kcal é baixo para quem treina duas vezes por dia.`);
  if (!inRange(b.maxExtraActive, 0, 1200)) errors.push('A atividade extra máxima deve ficar entre 0 e 1.200 kcal.');

  const badSteps = p.reductionLadder.filter((s) => !p.meals.some((m) => m.id === s.meal && m.items.some((i) => i.food === s.food)));
  if (badSteps.length) warnings.push(`${badSteps.length} passo(s) da ordem de cortes citam alimentos que não estão no cardápio e serão ignorados.`);
  return { errors, warnings, menuKcal };
}

/* ------------------------------------------------------------- diferenças */

const daysText = (d: number[]) => (d.length ? d.map(weekdayShort).join(', ') : 'nenhum');
const n = (v: number) => (Number.isFinite(v) ? v.toLocaleString('pt-BR') : String(v));
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function diffProtocols(a: Protocol, b: Protocol): { title: string; lines: string[] }[] {
  const out: { title: string; lines: string[] }[] = [];
  const t: string[] = [];
  const names: Record<keyof DailyTargets, string> = { kcal: 'Calorias', p: 'Proteína', c: 'Carboidrato', f: 'Gordura', steps: 'Passos' };
  for (const k of Object.keys(names) as (keyof DailyTargets)[]) {
    if (a.targets[k] !== b.targets[k]) t.push(`${names[k]}: ${n(a.targets[k])} → ${n(b.targets[k])}`);
  }
  if (t.length) out.push({ title: 'Metas diárias', lines: t });

  const m: string[] = [];
  const fa = foodIndex(a.foods);
  const fb = foodIndex(b.foods);
  const ka = Math.round(mealsTotalsWith(fa, a.meals).kcal);
  const kb = Math.round(mealsTotalsWith(fb, b.meals).kcal);
  if (ka !== kb) m.push(`Total do cardápio: ${n(ka)} → ${n(kb)} kcal`);
  for (const meal of b.meals) {
    const old = a.meals.find((x) => x.id === meal.id);
    if (!old) m.push(`Nova refeição: ${meal.name} (${meal.time})`);
    else if (!same(old, meal)) m.push(`Alterada: ${meal.name}${old.time !== meal.time ? ` (${old.time} → ${meal.time})` : ''}`);
  }
  for (const meal of a.meals) if (!b.meals.some((x) => x.id === meal.id)) m.push(`Removida: ${meal.name}`);
  const newFoods = b.foods.filter((f) => !a.foods.some((x) => x.id === f.id));
  if (newFoods.length) m.push(`Alimentos novos na tabela: ${newFoods.map((f) => f.name).join(', ')}`);
  if (m.length) out.push({ title: 'Cardápio', lines: m });

  const tr: string[] = [];
  const ta = a.training;
  const tb = b.training;
  if (!same(ta.spinDays, tb.spinDays)) tr.push(`Spinning: ${daysText(ta.spinDays)} → ${daysText(tb.spinDays)}`);
  if (!same(ta.liftDays, tb.liftDays)) tr.push(`Musculação: ${daysText(ta.liftDays)} → ${daysText(tb.liftDays)}`);
  if (!same(ta.legDays, tb.legDays)) tr.push(`Pernas: ${daysText(ta.legDays)} → ${daysText(tb.legDays)}`);
  if (ta.hardDay !== tb.hardDay) tr.push(`Sessão forte: ${weekdayShort(ta.hardDay)} → ${weekdayShort(tb.hardDay)}`);
  if (ta.spinTime !== tb.spinTime) tr.push(`Horário do spinning: ${ta.spinTime} → ${tb.spinTime}`);
  if (ta.liftTime !== tb.liftTime) tr.push(`Horário da musculação: ${ta.liftTime} → ${tb.liftTime}`);
  if (ta.intervalsFrom !== tb.intervalsFrom) tr.push(`Intervalado liberado: ${ta.intervalsFrom ? fmtShort(ta.intervalsFrom) : 'não'} → ${tb.intervalsFrom ? fmtShort(tb.intervalsFrom) : 'não'}`);
  for (const k of TARGET_KEYS) {
    if (ta.exerciseTargets[k] !== tb.exerciseTargets[k]) tr.push(`Meta ativa (${k}): ${n(ta.exerciseTargets[k])} → ${n(tb.exerciseTargets[k])} kcal`);
  }
  for (const k of SPIN_KEYS) if (!same(ta.sessions[k], tb.sessions[k])) tr.push(`Treino "${tb.sessions[k]?.name ?? k}" alterado`);
  if (!same(ta.zones, tb.zones)) tr.push('Zonas de frequência cardíaca alteradas');
  if (tr.length) out.push({ title: 'Treinos', lines: tr });

  const bk: string[] = [];
  const bn: Record<keyof BankParams, string> = {
    creditFactor: 'Crédito de treino',
    maxFoodCut: 'Corte máximo/dia',
    foodFloor: 'Piso de calorias',
    maxExtraActive: 'Atividade extra máx./dia',
    autoCalibrate: 'Calibração pelo relógio',
  };
  for (const k of Object.keys(bn) as (keyof BankParams)[]) {
    if (a.bank[k] !== b.bank[k]) {
      const f = (v: number | boolean) => (typeof v === 'boolean' ? (v ? 'sim' : 'não') : k === 'creditFactor' ? `${Math.round(v * 100)}%` : n(v));
      bk.push(`${bn[k]}: ${f(a.bank[k])} → ${f(b.bank[k])}`);
    }
  }
  if (!same(a.reductionLadder, b.reductionLadder)) bk.push('Ordem de cortes alterada');
  if (!same(a.substitutions, b.substitutions)) bk.push('Substituições alteradas');
  if (bk.length) out.push({ title: 'Banco e cortes', lines: bk });
  return out;
}
