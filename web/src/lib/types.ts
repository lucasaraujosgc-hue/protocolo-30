/** Identificador de refeição (definido pelo protocolo: cafe, lanche, almoco…). */
export type MealId = string;

export interface Totals {
  kcal: number;
  p: number;
  c: number;
  f: number;
}

/** Item registrado (alimento, besteira ou valor manual). */
export interface LogItem {
  name: string;
  grams?: number;
  qty?: number;
  kcal: number;
  p: number;
  c: number;
  f: number;
}

export type MealStatus = 'planned' | 'more' | 'less' | 'skipped' | 'swapped';

/** Quantidade comida de um item do prato, quando foi diferente do previsto. */
export interface PortionLog {
  /** Posição do item na refeição. */
  i: number;
  /** Id do alimento (confere se o cardápio mudou depois do registro). */
  food?: string;
  /** Gramas comidas (itens da tabela de alimentos). */
  grams?: number;
  /** Fração da porção (itens com calorias próprias): 0 = não comeu, 1 = normal. */
  mult?: number;
}

export interface MealLog extends Totals {
  status: MealStatus;
  /** Alimentos fora do prato (a mais/a menos) ou o que comeu no lugar (troquei). */
  items?: LogItem[];
  /** Itens do prato com quantidade diferente do previsto (a mais/a menos). */
  portions?: PortionLog[];
  /** Registros antigos: fração do prato comida (0–1). */
  fraction?: number;
  /** Horário em que comeu (HH:MM). Atrasos e adiantamentos ajustam as próximas refeições do dia. */
  time?: string;
  note?: string;
  at: string;
}

export interface ExtraLog extends Totals {
  id: string;
  name: string;
  qty?: number;
  grams?: number;
  at: string;
}

export type ExerciseKind = 'spinning' | 'musculacao' | 'outro';
export type SpinTemplate = 'z2' | 'tempo' | 'intervalado' | 'livre';
export type ExerciseStatus = 'done' | 'partial' | 'missed';
export type PlannedKey = 'spin' | 'lift';

export interface ExerciseLog {
  id: string;
  kind: ExerciseKind;
  template?: SpinTemplate;
  status: ExerciseStatus;
  plannedKey?: PlannedKey;
  minutes?: number;
  activeKcal?: number;
  totalKcal?: number;
  avgHr?: number;
  rpe?: number;
  note?: string;
  at: string;
}

export interface DayLog {
  meals: Record<MealId, MealLog>;
  extras: ExtraLog[];
  exercises: ExerciseLog[];
  steps?: number;
  /** Débito que você decidiu absorver (aceitar o atraso) em vez de compensar. */
  absorbed?: number;
}

export interface Measurement {
  id: string;
  date: string;
  time: string;
  fasting: boolean;
  weight?: number;
  waistNavel?: number;
  waistNarrow?: number;
  neck?: number;
  chest?: number;
  hip?: number;
  armRelaxed?: number;
  armFlexed?: number;
  thigh?: number;
  calf?: number;
  restingHr?: number;
  bpSys?: number;
  bpDia?: number;
  note?: string;
}

export type MeasureKey =
  | 'weight'
  | 'waistNavel'
  | 'waistNarrow'
  | 'neck'
  | 'chest'
  | 'hip'
  | 'armRelaxed'
  | 'armFlexed'
  | 'thigh'
  | 'calf'
  | 'restingHr';

export type TargetKey = 'z2' | 'tempo' | 'intervalado' | 'livre' | 'musculacao' | 'outro';
export const TARGET_KEYS: TargetKey[] = ['z2', 'tempo', 'intervalado', 'livre', 'musculacao', 'outro'];
export const SPIN_KEYS: SpinTemplate[] = ['z2', 'tempo', 'intervalado', 'livre'];

/* ------------------------------------------------------------- protocolo */

/** Item do cardápio: alimento da tabela (food + grams), item livre sem calorias (free) ou item com macros próprios. */
export interface ProtoItem {
  food?: string;
  grams?: number;
  label?: string;
  free?: string;
  kcal?: number;
  p?: number;
  c?: number;
  f?: number;
}

export interface ProtoMeal {
  id: MealId;
  name: string;
  short?: string;
  time: string;
  hint?: string;
  items: ProtoItem[];
}

export interface ProtoFood {
  id: string;
  name: string;
  group?: string;
  per100: Totals;
  unit?: { label: string; grams: number };
  source?: string;
}

export interface SessionTemplate {
  name: string;
  zone: string;
  hr: string;
  rpe: string;
  blocks: string[];
}

export interface HrZone {
  z: number;
  range: string;
  use: string;
}

export interface Training {
  liftDays: number[];
  legDays: number[];
  spinDays: number[];
  hardDay: number;
  spinTime: string;
  liftTime: string;
  intervalsFrom: string | null;
  exerciseTargets: Record<TargetKey, number>;
  sessions: Record<SpinTemplate, SessionTemplate>;
  zones: HrZone[];
  liftDetail: string;
}

export interface BankParams {
  /** Fração dos créditos de exercício/passos que entra no banco (relógios superestimam). */
  creditFactor: number;
  maxFoodCut: number;
  foodFloor: number;
  maxExtraActive: number;
  autoCalibrate: boolean;
}

export interface DailyTargets {
  kcal: number;
  p: number;
  c: number;
  f: number;
  steps: number;
}

export interface LadderStep {
  meal: MealId;
  food: string;
  from: number;
  to: number;
}

export interface SubstitutionRow {
  food: string;
  qty: string;
  kcal: number;
}

export interface Protocol {
  id: string;
  name: string;
  /** Vale a partir desta data (inclusive) até a próxima versão. */
  from: string;
  createdAt: string;
  source: 'padrao' | 'ajustes' | 'arquivo' | 'migracao';
  notes?: string;
  targets: DailyTargets;
  meals: ProtoMeal[];
  foods: ProtoFood[];
  training: Training;
  bank: BankParams;
  reductionLadder: LadderStep[];
  substitutions: { carbs: SubstitutionRow[]; proteins: SubstitutionRow[] };
}

/* ----------------------------------------------------------------- estado */

export interface Settings {
  startDate: string;
}

export interface Profile {
  name?: string;
  heightCm: number;
  age: number;
  sex: 'M' | 'F';
}

export type CompMode = 'food' | 'mix' | 'exercise';

export interface Compensation {
  active: boolean;
  mode: CompMode;
  days: number;
  startDate: string;
  foodShare: number;
  debt: number;
  perDayFood: number;
  perDayActive: number;
  createdAt: string;
}

export interface AppState {
  version: 2;
  profile: Profile | null;
  settings: Settings;
  protocols: Protocol[];
  days: Record<string, DayLog>;
  measurements: Measurement[];
  compensation: Compensation | null;
  updatedAt: string;
}

/** Formato antigo das configurações (antes do protocolo versionado). */
export interface LegacySettings {
  startDate?: string;
  targets?: { from: string; kcal: number; p: number; c: number; f: number; steps: number }[];
  exerciseTargets?: Partial<Record<TargetKey, number>>;
  autoCalibrate?: boolean;
  creditFactor?: number;
  maxFoodCut?: number;
  foodFloor?: number;
  maxExtraActive?: number;
  liftDays?: number[];
  legDays?: number[];
  spinDays?: number[];
  hardDay?: number;
  intervalsFrom?: string | null;
  spinTime?: string;
  liftTime?: string;
}

export interface RawState {
  version?: number;
  profile: Profile | null;
  settings: LegacySettings | null;
  protocols?: Protocol[];
  days: Record<string, DayLog>;
  measurements: Measurement[];
  compensation: Compensation | null;
  updatedAt: string;
}
