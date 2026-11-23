/**
 * Validação de entrada: reconstrói cada objeto só com os campos conhecidos,
 * dentro de faixas plausíveis. Qualquer outra coisa é descartada.
 */

export class ValidationError extends Error {}

const ID_RE = /^[a-z0-9_-]{1,30}$/;
const FOOD_ID_RE = /^[a-z0-9_-]{1,40}$/;
const MAX_MEALS = 12;
const MEAL_STATUS = ['planned', 'more', 'less', 'skipped', 'swapped'];
const EX_KINDS = ['spinning', 'musculacao', 'outro'];
const SPIN = ['z2', 'tempo', 'intervalado', 'livre'];
const EX_STATUS = ['done', 'partial', 'missed'];
const PLANNED = ['spin', 'lift'];
const COMP_MODES = ['food', 'mix', 'exercise'];
const TARGET_KEYS = ['z2', 'tempo', 'intervalado', 'livre', 'musculacao', 'outro'];
const SOURCES = ['padrao', 'ajustes', 'arquivo', 'migracao'];

export function isDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

const isTime = (s) => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);

function num(v, min, max) {
  if (v === null || v === undefined || v === '') return undefined;
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : v;
  if (typeof n !== 'number' || !Number.isFinite(n) || n < min || n > max) return undefined;
  return Math.round(n * 100) / 100;
}

function str(v, max) {
  if (typeof v !== 'string') return undefined;
  const t = v.trim().slice(0, max);
  return t || undefined;
}

const oneOf = (v, list) => (list.includes(v) ? v : undefined);

function clean(obj) {
  for (const k of Object.keys(obj)) if (obj[k] === undefined) delete obj[k];
  return obj;
}

function items(list) {
  if (!Array.isArray(list)) return undefined;
  return list.slice(0, 40).map((it) =>
    clean({
      name: str(it?.name, 120) ?? 'Item',
      grams: num(it?.grams, 0, 5000),
      qty: num(it?.qty, 0, 100),
      kcal: num(it?.kcal, 0, 20000) ?? 0,
      p: num(it?.p, 0, 2000) ?? 0,
      c: num(it?.c, 0, 2000) ?? 0,
      f: num(it?.f, 0, 2000) ?? 0,
    }),
  );
}

function portions(list) {
  if (!Array.isArray(list)) return undefined;
  const out = list
    .filter((x) => x && Number.isInteger(x.i) && x.i >= 0 && x.i < 30)
    .slice(0, 30)
    .map((x) =>
      clean({
        i: x.i,
        food: typeof x.food === 'string' && FOOD_ID_RE.test(x.food) ? x.food : undefined,
        grams: num(x.grams, 0, 5000),
        mult: num(x.mult, 0, 10),
      }),
    )
    .filter((x) => x.grams !== undefined || x.mult !== undefined);
  return out.length ? out : undefined;
}

function mealLog(m) {
  const status = oneOf(m?.status, MEAL_STATUS);
  if (!status) throw new ValidationError('status de refeição inválido');
  return clean({
    status,
    kcal: num(m.kcal, 0, 20000) ?? 0,
    p: num(m.p, 0, 2000) ?? 0,
    c: num(m.c, 0, 2000) ?? 0,
    f: num(m.f, 0, 2000) ?? 0,
    items: items(m.items),
    portions: portions(m.portions),
    fraction: num(m.fraction, 0, 1),
    time: isTime(m.time) ? m.time : undefined,
    note: str(m.note, 300),
    at: str(m.at, 40) ?? new Date().toISOString(),
  });
}

function extra(e) {
  return clean({
    id: str(e?.id, 40) ?? Math.random().toString(36).slice(2),
    name: str(e?.name, 120) ?? 'Extra',
    qty: num(e?.qty, 0, 100),
    grams: num(e?.grams, 0, 5000),
    kcal: num(e?.kcal, 0, 20000) ?? 0,
    p: num(e?.p, 0, 2000) ?? 0,
    c: num(e?.c, 0, 2000) ?? 0,
    f: num(e?.f, 0, 2000) ?? 0,
    at: str(e?.at, 40) ?? new Date().toISOString(),
  });
}

function exercise(e) {
  const kind = oneOf(e?.kind, EX_KINDS);
  const status = oneOf(e?.status, EX_STATUS);
  if (!kind || !status) throw new ValidationError('treino inválido');
  return clean({
    id: str(e.id, 40) ?? Math.random().toString(36).slice(2),
    kind,
    template: kind === 'spinning' ? oneOf(e.template, SPIN) ?? 'livre' : undefined,
    status,
    plannedKey: oneOf(e.plannedKey, PLANNED),
    minutes: num(e.minutes, 0, 600),
    activeKcal: num(e.activeKcal, 0, 5000),
    totalKcal: num(e.totalKcal, 0, 10000),
    avgHr: num(e.avgHr, 30, 230),
    rpe: num(e.rpe, 0, 10),
    note: str(e.note, 300),
    at: str(e.at, 40) ?? new Date().toISOString(),
  });
}

export function sanitizeDay(input) {
  if (!input || typeof input !== 'object') throw new ValidationError('dia inválido');
  const meals = {};
  if (input.meals && typeof input.meals === 'object') {
    for (const [id, log] of Object.entries(input.meals)) {
      if (!ID_RE.test(id) || !log) continue;
      if (Object.keys(meals).length >= MAX_MEALS * 2) break;
      meals[id] = mealLog(log);
    }
  }
  const steps = num(input.steps, 0, 150000);
  const absorbed = num(input.absorbed, 0, 100000);
  return clean({
    meals,
    extras: Array.isArray(input.extras) ? input.extras.slice(0, 60).map(extra) : [],
    exercises: Array.isArray(input.exercises) ? input.exercises.slice(0, 20).map(exercise) : [],
    steps: steps === undefined ? undefined : Math.round(steps),
    absorbed: absorbed ? Math.round(absorbed) : undefined,
  });
}

export function sanitizeMeasurement(m, id) {
  if (!m || typeof m !== 'object') throw new ValidationError('medida inválida');
  if (!isDate(m.date)) throw new ValidationError('data inválida');
  const out = clean({
    id,
    date: m.date,
    time: isTime(m.time) ? m.time : '07:00',
    fasting: m.fasting !== false,
    weight: num(m.weight, 30, 350),
    waistNavel: num(m.waistNavel, 40, 250),
    waistNarrow: num(m.waistNarrow, 40, 250),
    neck: num(m.neck, 20, 80),
    chest: num(m.chest, 50, 250),
    hip: num(m.hip, 50, 250),
    armRelaxed: num(m.armRelaxed, 15, 80),
    armFlexed: num(m.armFlexed, 15, 80),
    thigh: num(m.thigh, 25, 120),
    calf: num(m.calf, 20, 80),
    restingHr: num(m.restingHr, 30, 150),
    bpSys: num(m.bpSys, 70, 260),
    bpDia: num(m.bpDia, 40, 160),
    note: str(m.note, 300),
  });
  const hasValue = Object.keys(out).some((k) => !['id', 'date', 'time', 'fasting', 'note'].includes(k));
  if (!hasValue) throw new ValidationError('informe ao menos uma medida');
  return out;
}

export function sanitizeProfile(p) {
  if (!p || typeof p !== 'object') throw new ValidationError('perfil inválido');
  const heightCm = num(p.heightCm, 120, 230);
  const age = num(p.age, 14, 100);
  if (!heightCm || !age) throw new ValidationError('altura e idade são obrigatórias');
  return clean({ name: str(p.name, 60), heightCm, age: Math.round(age), sex: p.sex === 'F' ? 'F' : 'M' });
}

const days = (v) => (Array.isArray(v) ? [...new Set(v.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort() : undefined);

/**
 * Configurações: hoje só a data de início. Campos do formato antigo (antes do protocolo versionado)
 * são mantidos, validados, para o app migrar backups antigos.
 */
export function sanitizeSettings(s) {
  if (!s || typeof s !== 'object') throw new ValidationError('configurações inválidas');
  if (!isDate(s.startDate)) throw new ValidationError('data de início inválida');
  const out = { startDate: s.startDate };
  if (Array.isArray(s.targets)) {
    const targets = s.targets
      .filter((t) => isDate(t?.from))
      .slice(0, 50)
      .map((t) => ({
        from: t.from,
        kcal: num(t.kcal, 1200, 6000) ?? 2250,
        p: num(t.p, 50, 400) ?? 190,
        c: num(t.c, 0, 800) ?? 240,
        f: num(t.f, 20, 300) ?? 55,
        steps: Math.round(num(t.steps, 0, 40000) ?? 10000),
      }));
    if (targets.length) out.targets = targets;
  }
  if (s.exerciseTargets && typeof s.exerciseTargets === 'object') {
    out.exerciseTargets = {};
    for (const k of TARGET_KEYS) {
      const v = num(s.exerciseTargets[k], 0, 3000);
      if (v !== undefined) out.exerciseTargets[k] = v;
    }
  }
  if (typeof s.autoCalibrate === 'boolean') out.autoCalibrate = s.autoCalibrate;
  const cf = num(s.creditFactor, 0.3, 1);
  if (cf !== undefined) out.creditFactor = cf;
  const mfc = num(s.maxFoodCut, 0, 800);
  if (mfc !== undefined) out.maxFoodCut = mfc;
  const ff = num(s.foodFloor, 1200, 4000);
  if (ff !== undefined) out.foodFloor = ff;
  const mea = num(s.maxExtraActive, 0, 1200);
  if (mea !== undefined) out.maxExtraActive = mea;
  for (const k of ['liftDays', 'legDays', 'spinDays']) {
    const v = days(s[k]);
    if (v) out[k] = v;
  }
  if (Number.isInteger(s.hardDay) && s.hardDay >= 0 && s.hardDay <= 6) out.hardDay = s.hardDay;
  if (s.intervalsFrom === null || isDate(s.intervalsFrom)) out.intervalsFrom = s.intervalsFrom ?? null;
  if (isTime(s.spinTime)) out.spinTime = s.spinTime;
  if (isTime(s.liftTime)) out.liftTime = s.liftTime;
  return out;
}

/* --------------------------------------------------------------- protocolo */

function numReq(v, min, max, what) {
  const n = num(v, min, max);
  if (n === undefined) throw new ValidationError(`${what} fora da faixa (${min}–${max})`);
  return n;
}

function protoItem(it) {
  if (!it || typeof it !== 'object') throw new ValidationError('item de refeição inválido');
  const food = typeof it.food === 'string' && FOOD_ID_RE.test(it.food) ? it.food : undefined;
  const out = clean({
    food,
    grams: num(it.grams, 0, 5000),
    label: str(it.label, 120),
    free: str(it.free, 120),
    kcal: num(it.kcal, 0, 5000),
    p: num(it.p, 0, 5000),
    c: num(it.c, 0, 5000),
    f: num(it.f, 0, 5000),
  });
  if (!out.food && !out.free && !out.label) throw new ValidationError('item de refeição sem alimento nem nome');
  return out;
}

function protoMeal(m) {
  if (!m || typeof m !== 'object') throw new ValidationError('refeição inválida');
  if (typeof m.id !== 'string' || !ID_RE.test(m.id)) throw new ValidationError('id de refeição inválido');
  if (!isTime(m.time)) throw new ValidationError(`horário inválido na refeição ${m.id}`);
  return clean({
    id: m.id,
    name: str(m.name, 60) ?? m.id,
    short: str(m.short, 24),
    time: m.time,
    hint: str(m.hint, 140),
    items: Array.isArray(m.items) ? m.items.slice(0, 30).map(protoItem) : [],
  });
}

function protoFood(f) {
  if (!f || typeof f !== 'object' || typeof f.id !== 'string' || !FOOD_ID_RE.test(f.id)) throw new ValidationError('alimento inválido');
  const per = f.per100 && typeof f.per100 === 'object' ? f.per100 : {};
  const unit =
    f.unit && typeof f.unit === 'object' && str(f.unit.label, 40) && num(f.unit.grams, 0, 5000) !== undefined
      ? { label: str(f.unit.label, 40), grams: num(f.unit.grams, 0, 5000) }
      : undefined;
  return clean({
    id: f.id,
    name: str(f.name, 80) ?? f.id,
    group: str(f.group, 40),
    per100: { kcal: num(per.kcal, 0, 950) ?? 0, p: num(per.p, 0, 100) ?? 0, c: num(per.c, 0, 100) ?? 0, f: num(per.f, 0, 100) ?? 0 },
    unit,
    source: str(f.source, 60),
  });
}

function strList(v, maxItems, maxLen) {
  return Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, maxItems).map((x) => x.slice(0, maxLen)) : [];
}

function session(sv) {
  const o = sv && typeof sv === 'object' ? sv : {};
  return {
    name: str(o.name, 40) ?? 'Sessão',
    zone: str(o.zone, 40) ?? '',
    hr: str(o.hr, 40) ?? '',
    rpe: str(o.rpe, 80) ?? '',
    blocks: strList(o.blocks, 12, 140),
  };
}

function training(t) {
  if (!t || typeof t !== 'object') throw new ValidationError('treino do protocolo inválido');
  const exerciseTargets = {};
  for (const k of TARGET_KEYS) exerciseTargets[k] = numReq(t.exerciseTargets?.[k], 0, 3000, `meta de treino ${k}`);
  const sessions = {};
  for (const k of SPIN) sessions[k] = session(t.sessions?.[k]);
  const zones = Array.isArray(t.zones)
    ? t.zones
        .filter((z) => z && Number.isInteger(z.z) && z.z >= 1 && z.z <= 9)
        .slice(0, 9)
        .map((z) => ({ z: z.z, range: str(z.range, 24) ?? '', use: str(z.use, 80) ?? '' }))
    : [];
  if (!(t.intervalsFrom === null || t.intervalsFrom === undefined || isDate(t.intervalsFrom))) throw new ValidationError('data do intervalado inválida');
  if (!isTime(t.spinTime) || !isTime(t.liftTime)) throw new ValidationError('horário de treino inválido');
  if (!(Number.isInteger(t.hardDay) && t.hardDay >= 0 && t.hardDay <= 6)) throw new ValidationError('dia da sessão forte inválido');
  return {
    liftDays: days(t.liftDays) ?? [],
    legDays: days(t.legDays) ?? [],
    spinDays: days(t.spinDays) ?? [],
    hardDay: t.hardDay,
    spinTime: t.spinTime,
    liftTime: t.liftTime,
    intervalsFrom: t.intervalsFrom ?? null,
    exerciseTargets,
    sessions,
    zones,
    liftDetail: str(t.liftDetail, 140) ?? '',
  };
}

function subsList(v) {
  return Array.isArray(v)
    ? v
        .filter((r) => r && typeof r.food === 'string')
        .slice(0, 40)
        .map((r) => ({ food: r.food.slice(0, 80), qty: typeof r.qty === 'string' ? r.qty.slice(0, 40) : '', kcal: num(r.kcal, 0, 5000) ?? 0 }))
    : [];
}

export function sanitizeProtocol(p) {
  if (!p || typeof p !== 'object') throw new ValidationError('protocolo inválido');
  if (!isDate(p.from)) throw new ValidationError('data de início da versão inválida');
  const t = p.targets ?? {};
  const meals = Array.isArray(p.meals) ? p.meals.slice(0, MAX_MEALS).map(protoMeal) : [];
  if (!meals.length) throw new ValidationError('o protocolo precisa de pelo menos uma refeição');
  if (new Set(meals.map((m) => m.id)).size !== meals.length) throw new ValidationError('ids de refeição repetidos');
  const b = p.bank ?? {};
  return clean({
    id: typeof p.id === 'string' && /^[\w-]{1,40}$/.test(p.id) ? p.id : `p${Date.now().toString(36)}`,
    name: str(p.name, 80) ?? 'Protocolo',
    from: p.from,
    createdAt: str(p.createdAt, 40) ?? new Date().toISOString(),
    source: oneOf(p.source, SOURCES) ?? 'arquivo',
    notes: str(p.notes, 3000),
    targets: {
      kcal: numReq(t.kcal, 1200, 6000, 'meta de calorias'),
      p: numReq(t.p, 50, 400, 'meta de proteína'),
      c: numReq(t.c, 0, 800, 'meta de carboidrato'),
      f: numReq(t.f, 20, 300, 'meta de gordura'),
      steps: Math.round(numReq(t.steps, 0, 40000, 'meta de passos')),
    },
    meals,
    foods: Array.isArray(p.foods) ? p.foods.slice(0, 200).map(protoFood) : [],
    training: training(p.training),
    bank: {
      creditFactor: numReq(b.creditFactor, 0.3, 1, 'fator de crédito'),
      maxFoodCut: numReq(b.maxFoodCut, 0, 800, 'corte máximo de comida'),
      foodFloor: numReq(b.foodFloor, 1200, 4000, 'piso de calorias'),
      maxExtraActive: numReq(b.maxExtraActive, 0, 1200, 'atividade extra máxima'),
      autoCalibrate: b.autoCalibrate !== false,
    },
    reductionLadder: Array.isArray(p.reductionLadder)
      ? p.reductionLadder
          .filter((x) => x && ID_RE.test(String(x.meal)) && FOOD_ID_RE.test(String(x.food)))
          .slice(0, 40)
          .map((x) => ({ meal: x.meal, food: x.food, from: num(x.from, 0, 5000) ?? 0, to: num(x.to, 0, 5000) ?? 0 }))
      : [],
    substitutions: { carbs: subsList(p.substitutions?.carbs), proteins: subsList(p.substitutions?.proteins) },
  });
}

/** Lista de versões: uma por data de início (a última enviada vence), em ordem de data. */
export function sanitizeProtocols(list) {
  if (!Array.isArray(list) || !list.length) throw new ValidationError('envie ao menos uma versão do protocolo');
  if (list.length > 100) throw new ValidationError('versões demais (máximo de 100)');
  const byFrom = new Map();
  for (const raw of list) {
    const p = sanitizeProtocol(raw);
    byFrom.set(p.from, p);
  }
  return [...byFrom.values()].sort((a, b) => a.from.localeCompare(b.from));
}

export function sanitizeCompensation(c) {
  if (c === null) return null;
  if (!c || typeof c !== 'object') throw new ValidationError('compensação inválida');
  const mode = oneOf(c.mode, COMP_MODES);
  if (!mode || !isDate(c.startDate)) throw new ValidationError('compensação inválida');
  return {
    active: c.active !== false,
    mode,
    days: Math.round(num(c.days, 1, 21) ?? 3),
    startDate: c.startDate,
    foodShare: num(c.foodShare, 0, 1) ?? 0.5,
    debt: num(c.debt, 0, 100000) ?? 0,
    perDayFood: num(c.perDayFood, 0, 3000) ?? 0,
    perDayActive: num(c.perDayActive, 0, 5000) ?? 0,
    createdAt: str(c.createdAt, 40) ?? new Date().toISOString(),
  };
}

/** Importação de backup: valida tudo, campo a campo. */
export function sanitizeState(s) {
  if (!s || typeof s !== 'object') throw new ValidationError('arquivo inválido');
  if (!('days' in s) && !('settings' in s) && !('profile' in s)) throw new ValidationError('isso não parece um backup do Protocolo 30');
  const out = {
    version: 2,
    profile: s.profile ? sanitizeProfile(s.profile) : null,
    settings: s.settings ? sanitizeSettings(s.settings) : null,
    protocols: Array.isArray(s.protocols) && s.protocols.length ? sanitizeProtocols(s.protocols) : [],
    days: {},
    measurements: [],
    compensation: s.compensation ? sanitizeCompensation(s.compensation) : null,
    updatedAt: new Date().toISOString(),
  };
  if (s.days && typeof s.days === 'object') {
    for (const [date, day] of Object.entries(s.days).slice(0, 4000)) {
      if (isDate(date)) out.days[date] = sanitizeDay(day);
    }
  }
  if (Array.isArray(s.measurements)) {
    for (const m of s.measurements.slice(0, 10000)) {
      try {
        const id = str(m?.id, 40) ?? Math.random().toString(36).slice(2);
        out.measurements.push(sanitizeMeasurement(m, id));
      } catch {
        /* ignora linha inválida */
      }
    }
  }
  return out;
}
