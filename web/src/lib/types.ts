export type MealId = 'cafe' | 'lanche' | 'almoco' | 'pre' | 'jantar';
export const MEAL_IDS: MealId[] = ['cafe', 'lanche', 'almoco', 'pre', 'jantar'];

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

export interface MealLog extends Totals {
  status: MealStatus;
  /** Itens extras (a mais) ou substitutos (troquei). */
  items?: LogItem[];
  /** Fração comida quando status = less (0–1). */
  fraction?: number;
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
  meals: Partial<Record<MealId, MealLog>>;
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

export interface TargetPeriod {
  from: string;
  kcal: number;
  p: number;
  c: number;
  f: number;
  steps: number;
}

export type TargetKey = 'z2' | 'tempo' | 'intervalado' | 'livre' | 'musculacao' | 'outro';

export interface Settings {
  startDate: string;
  targets: TargetPeriod[];
  exerciseTargets: Record<TargetKey, number>;
  autoCalibrate: boolean;
  /** Fração dos créditos de exercício/passos que entra no banco (relógios superestimam). */
  creditFactor: number;
  maxFoodCut: number;
  foodFloor: number;
  maxExtraActive: number;
  liftDays: number[];
  legDays: number[];
  spinDays: number[];
  hardDay: number;
  intervalsFrom: string | null;
  spinTime: string;
  liftTime: string;
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
  version: 1;
  profile: Profile | null;
  settings: Settings;
  days: Record<string, DayLog>;
  measurements: Measurement[];
  compensation: Compensation | null;
  updatedAt: string;
}

export interface RawState extends Omit<AppState, 'settings'> {
  settings: Partial<Settings> | null;
}
