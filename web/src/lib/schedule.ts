import { addDays, diffDays, weekday } from './dates';
import type { ExerciseKind, HrZone, PlannedKey, SessionTemplate, SpinTemplate, TargetKey, Training } from './types';

export const DEFAULT_START = '2026-11-23';

export const DEFAULT_SESSIONS: Record<SpinTemplate, SessionTemplate> = {
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

export const DEFAULT_ZONES: HrZone[] = [
  { z: 1, range: 'até 109', use: 'Aquecimento e recuperação' },
  { z: 2, range: '110–130', use: 'Base (Z2 30)' },
  { z: 3, range: '131–144', use: 'Blocos do Tempo 3x4' },
  { z: 4, range: '145–155', use: 'Tiros do Intervalado 5x2' },
  { z: 5, range: '156+', use: 'Não usar neste plano' },
];

export const ZONE_COLORS = ['var(--z1)', 'var(--z2)', 'var(--z3)', 'var(--z4)', 'var(--z5)'];

export function defaultTraining(): Training {
  return {
    liftDays: [1, 2, 3, 4, 5],
    legDays: [1, 4],
    spinDays: [2, 3, 5, 6],
    hardDay: 3,
    spinTime: '05:30',
    liftTime: '17:00',
    intervalsFrom: null,
    exerciseTargets: { z2: 250, tempo: 280, intervalado: 300, livre: 250, musculacao: 280, outro: 200 },
    sessions: structuredClone(DEFAULT_SESSIONS),
    zones: structuredClone(DEFAULT_ZONES),
    liftDetail: 'Com o personal · progressão de carga',
  };
}

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

export function intervalsReleased(training: Training, date: string): boolean {
  return !!training.intervalsFrom && date >= training.intervalsFrom;
}

export function plannedSessions(training: Training, startDate: string, date: string): PlannedSession[] {
  if (diffDays(date, startDate) < 0) return [];
  const dow = weekday(date);
  const out: PlannedSession[] = [];
  if (training.spinDays.includes(dow)) {
    let template: SpinTemplate = 'z2';
    if (dow === training.hardDay) template = intervalsReleased(training, date) ? 'intervalado' : 'tempo';
    const info = training.sessions[template] ?? DEFAULT_SESSIONS[template];
    out.push({
      key: 'spin',
      kind: 'spinning',
      template,
      targetKey: template,
      label: `Spinning · ${info.name}`,
      time: training.spinTime,
      detail: `${info.zone} · ${info.hr}`,
    });
  }
  if (training.liftDays.includes(dow)) {
    const leg = training.legDays.includes(dow);
    out.push({
      key: 'lift',
      kind: 'musculacao',
      targetKey: 'musculacao',
      label: leg ? 'Musculação · pernas' : 'Musculação',
      time: training.liftTime,
      detail: training.liftDetail,
      isLegDay: leg,
    });
  }
  return out;
}

/** Próxima data (depois de `date`) que cai no dia da sessão forte. */
export function nextHardDay(training: Training, date: string): string {
  let d = addDays(date, 1);
  for (let i = 0; i < 7; i++) {
    if (weekday(d) === training.hardDay) return d;
    d = addDays(d, 1);
  }
  return d;
}

/** Avisos quando a semana configurada quebra as regras do plano. */
export function scheduleWarnings(training: Training): string[] {
  const w: string[] = [];
  for (const leg of training.legDays) {
    if (training.spinDays.includes(leg)) w.push('Há spinning na manhã de um dia de perna.');
    const after = (leg + 1) % 7;
    if (after === training.hardDay && training.spinDays.includes(after)) {
      w.push('A sessão forte cai no dia seguinte ao treino de perna.');
    }
    if (training.hardDay === leg) w.push('A sessão forte cai no dia de perna.');
  }
  if (!training.spinDays.includes(training.hardDay)) w.push('O dia da sessão forte não está entre os dias de spinning.');
  if (training.spinDays.length > 5) w.push('Mais de 5 sessões de spinning por semana atrapalham a recuperação.');
  return [...new Set(w)];
}
