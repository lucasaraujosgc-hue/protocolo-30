/**
 * Validação de entrada: reconstrói cada objeto só com os campos conhecidos,
 * dentro de faixas plausíveis. Qualquer outra coisa é descartada.
 */

export class ValidationError extends Error {}

const MEAL_IDS = ['cafe', 'lanche', 'almoco', 'pre', 'jantar'];
const MEAL_STATUS = ['planned', 'more', 'less', 'skipped', 'swapped'];
const EX_KINDS = ['spinning', 'musculacao', 'outro'];
const SPIN = ['z2', 'tempo', 'intervalado', 'livre'];
const EX_STATUS = ['done', 'partial', 'missed'];
const PLANNED = ['spin', 'lift'];
const COMP_MODES = ['food', 'mix', 'exercise'];
const TARGET_KEYS = ['z2', 'tempo', 'intervalado', 'livre', 'musculacao', 'outro'];

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
    fraction: num(m.fraction, 0, 1),
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
  for (const id of MEAL_IDS) {
    if (input.meals && input.meals[id]) meals[id] = mealLog(input.meals[id]);
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

export function sanitizeSettings(s) {
  if (!s || typeof s !== 'object') throw new ValidationError('configurações inválidas');
  if (!isDate(s.startDate)) throw new ValidationError('data de início inválida');
  const targets = Array.isArray(s.targets)
    ? s.targets
        .filter((t) => isDate(t?.from))
        .slice(0, 50)
        .map((t) => ({
          from: t.from,
          kcal: num(t.kcal, 1200, 6000) ?? 2250,
          p: num(t.p, 50, 400) ?? 190,
          c: num(t.c, 0, 800) ?? 240,
          f: num(t.f, 20, 300) ?? 55,
          steps: Math.round(num(t.steps, 0, 40000) ?? 10000),
        }))
    : [];
  if (!targets.length) throw new ValidationError('defina ao menos uma meta');
  const exerciseTargets = {};
  for (const k of TARGET_KEYS) exerciseTargets[k] = num(s.exerciseTargets?.[k], 0, 3000) ?? 250;
  const hardDay = Number.isInteger(s.hardDay) && s.hardDay >= 0 && s.hardDay <= 6 ? s.hardDay : 3;
  return {
    startDate: s.startDate,
    targets,
    exerciseTargets,
    autoCalibrate: s.autoCalibrate !== false,
    creditFactor: num(s.creditFactor, 0.3, 1) ?? 0.75,
    maxFoodCut: num(s.maxFoodCut, 0, 800) ?? 300,
    foodFloor: num(s.foodFloor, 1200, 4000) ?? 1950,
    maxExtraActive: num(s.maxExtraActive, 0, 1200) ?? 300,
    liftDays: days(s.liftDays) ?? [1, 2, 3, 4, 5],
    legDays: days(s.legDays) ?? [1, 4],
    spinDays: days(s.spinDays) ?? [2, 3, 5, 6],
    hardDay,
    intervalsFrom: isDate(s.intervalsFrom) ? s.intervalsFrom : null,
    spinTime: isTime(s.spinTime) ? s.spinTime : '05:30',
    liftTime: isTime(s.liftTime) ? s.liftTime : '17:00',
  };
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
  const out = {
    version: 1,
    profile: s.profile ? sanitizeProfile(s.profile) : null,
    settings: s.settings ? sanitizeSettings(s.settings) : null,
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
