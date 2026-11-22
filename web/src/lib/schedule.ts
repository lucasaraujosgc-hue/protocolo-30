import { addDays, diffDays, weekday } from './dates';
import { PLAN_TOTALS, PLAN_KCAL } from './plan';
import type { ExerciseKind, PlannedKey, Settings, SpinTemplate, TargetKey } from './types';

export const DEFAULT_START = '2026-11-23';

export function defaultSettings(startDate = DEFAULT_START): Settings {
  return {
    startDate,
    targets: [
      {
        from: startDate,
        kcal: PLAN_KCAL,
        p: Math.round(PLAN_TOTALS.p),
        c: Math.round(PLAN_TOTALS.c),
        f: Math.round(PLAN_TOTALS.f),
        steps: 10000,
      },
    ],
    exerciseTargets: { z2: 250, tempo: 280, intervalado: 300, livre: 250, musculacao: 280, outro: 200 },
    autoCalibrate: true,
    creditFactor: 0.75,
    maxFoodCut: 300,
    foodFloor: 1950,
    maxExtraActive: 300,
    liftDays: [1, 2, 3, 4, 5],
    legDays: [1, 4],
    spinDays: [2, 3, 5, 6],
    hardDay: 3,
    intervalsFrom: null,
    spinTime: '05:30',
    liftTime: '17:00',
  };
}

/** Junta configurações salvas com os padrões (campos novos ganham valor padrão). */
export function withDefaults(raw: Partial<Settings> | null | undefined): Settings {
  const base = defaultSettings(raw?.startDate ?? DEFAULT_START);
  if (!raw) return base;
  return {
    ...base,
    ...raw,
    targets: raw.targets && raw.targets.length ? raw.targets : base.targets,
    exerciseTargets: { ...base.exerciseTargets, ...(raw.exerciseTargets ?? {}) },
  } as Settings;
}

export interface SpinTemplateInfo {
  name: string;
  zone: string;
  hr: string;
  rpe: string;
  blocks: string[];
}

export const SPIN_TEMPLATES: Record<SpinTemplate, SpinTemplateInfo> = {
  z2: {
    name: 'Z2 30',
    zone: 'Zona 2',
    hr: '110–130 bpm',
    rpe: 'RPE 3–4 · conversa em frases completas',
    blocks: ['Aquecimento · 5 min', 'Treino · 22 min · 110–130 bpm', 'Desaquecimento · 3 min'],
  },
  tempo: {
    name: 'Tempo 3x4',
    zone: 'Zona 3',
    hr: '131–144 bpm',
    rpe: 'RPE 5–6 · só frases curtas',
    blocks: ['Aquecimento · 8 min', '3× (Treino 4 min · 131–144 bpm + Recuperação 3 min)', 'Desaquecimento · 1 min'],
  },
  intervalado: {
    name: 'Intervalado 5x2',
    zone: 'Zona 4',
    hr: '145–155 bpm',
    rpe: 'RPE 7 · poucas palavras, não é sprint',
    blocks: ['Aquecimento · 8 min (suba até o topo da Zona 2)', '5× (Treino 2 min · 145–155 bpm + Recuperação 2 min)', 'Desaquecimento · 2 min'],
  },
  livre: {
    name: 'Livre',
    zone: 'Zona 2',
    hr: '110–130 bpm',
    rpe: 'RPE 3–4',
    blocks: ['Sessão livre registrada manualmente'],
  },
};

export const HR_ZONES = [
  { z: 1, range: 'até 109', use: 'Aquecimento e recuperação', color: 'var(--z1)' },
  { z: 2, range: '110–130', use: 'Base (Z2 30)', color: 'var(--z2)' },
  { z: 3, range: '131–144', use: 'Blocos do Tempo 3x4', color: 'var(--z3)' },
  { z: 4, range: '145–155', use: 'Tiros do Intervalado 5x2', color: 'var(--z4)' },
  { z: 5, range: '156+', use: 'Não usar neste plano', color: 'var(--z5)' },
];

export interface PlannedSession {
  key: PlannedKey;
  kind: ExerciseKind;
  template?: SpinTemplate;
  targetKey: TargetKey;
  label: string;
  time: string;
  detail: string;
  isLegDay?: boolean;
}

export function intervalsReleased(settings: Settings, date: string): boolean {
  return !!settings.intervalsFrom && date >= settings.intervalsFrom;
}

export function plannedSessions(settings: Settings, date: string): PlannedSession[] {
  if (diffDays(date, settings.startDate) < 0) return [];
  const dow = weekday(date);
  const out: PlannedSession[] = [];
  if (settings.spinDays.includes(dow)) {
    let template: SpinTemplate = 'z2';
    if (dow === settings.hardDay) template = intervalsReleased(settings, date) ? 'intervalado' : 'tempo';
    const info = SPIN_TEMPLATES[template];
    out.push({
      key: 'spin',
      kind: 'spinning',
      template,
      targetKey: template,
      label: `Spinning · ${info.name}`,
      time: settings.spinTime,
      detail: `${info.zone} · ${info.hr}`,
    });
  }
  if (settings.liftDays.includes(dow)) {
    const leg = settings.legDays.includes(dow);
    out.push({
      key: 'lift',
      kind: 'musculacao',
      targetKey: 'musculacao',
      label: leg ? 'Musculação · pernas' : 'Musculação',
      time: settings.liftTime,
      detail: 'Com o personal · progressão de carga',
      isLegDay: leg,
    });
  }
  return out;
}

/** Próxima data (depois de `date`) que cai no dia da sessão forte. */
export function nextHardDay(settings: Settings, date: string): string {
  let d = addDays(date, 1);
  for (let i = 0; i < 7; i++) {
    if (weekday(d) === settings.hardDay) return d;
    d = addDays(d, 1);
  }
  return d;
}

/** Avisos quando a semana configurada quebra as regras do plano. */
export function scheduleWarnings(settings: Settings): string[] {
  const w: string[] = [];
  for (const leg of settings.legDays) {
    if (settings.spinDays.includes(leg)) w.push('Há spinning na manhã de um dia de perna.');
    const after = (leg + 1) % 7;
    if (after === settings.hardDay && settings.spinDays.includes(after)) {
      w.push('A sessão forte cai no dia seguinte ao treino de perna.');
    }
    if (settings.hardDay === leg) w.push('A sessão forte cai no dia de perna.');
  }
  if (!settings.spinDays.includes(settings.hardDay)) w.push('O dia da sessão forte não está entre os dias de spinning.');
  if (settings.spinDays.length > 5) w.push('Mais de 5 sessões de spinning por semana atrapalham a recuperação.');
  return [...new Set(w)];
}
