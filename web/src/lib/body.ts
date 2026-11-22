import { sortedMeasurements } from './engine';
import type { Measurement, Profile } from './types';

export type RingKey = 'neck' | 'chest' | 'waistNarrow' | 'waistNavel' | 'hip' | 'arm' | 'thigh' | 'calf';

export const RING_KEYS: RingKey[] = ['neck', 'chest', 'waistNarrow', 'waistNavel', 'hip', 'arm', 'thigh', 'calf'];

export const RING_META: Record<RingKey, { label: string; color: string }> = {
  neck: { label: 'Pescoço', color: '#6b8cff' },
  chest: { label: 'Peito', color: '#4dd8ff' },
  waistNarrow: { label: 'Cintura estreita', color: '#c77dff' },
  waistNavel: { label: 'Cintura umbigo', color: '#ff4fd8' },
  hip: { label: 'Quadril', color: '#ffc24d' },
  arm: { label: 'Braço', color: '#9dff6a' },
  thigh: { label: 'Coxa', color: '#ff8a5c' },
  calf: { label: 'Panturrilha', color: '#ffe066' },
};

export interface BodyMeasures {
  height: number;
  neck: number;
  chest: number;
  waistNarrow: number;
  waistNavel: number;
  hip: number;
  arm: number;
  thigh: number;
  calf: number;
}

export interface Snapshot {
  date: string;
  m: BodyMeasures;
  weight?: number;
  estimated: RingKey[];
  measuredToday: RingKey[];
}

const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));

const FIELD: Record<RingKey, keyof Measurement> = {
  neck: 'neck',
  chest: 'chest',
  waistNarrow: 'waistNarrow',
  waistNavel: 'waistNavel',
  hip: 'hip',
  arm: 'armRelaxed',
  thigh: 'thigh',
  calf: 'calf',
};

/** Completa medidas que ainda não foram tiradas com proporções típicas (marcadas como estimadas). */
export function completeMeasures(known: Partial<Record<RingKey, number>>, heightCm: number, weight?: number): { m: BodyMeasures; estimated: RingKey[] } {
  const est: RingKey[] = [];
  const get = (k: RingKey, f: () => number) => {
    const v = known[k];
    if (typeof v === 'number') return v;
    est.push(k);
    return f();
  };
  const bmi = weight ? weight / (heightCm / 100) ** 2 : 25;
  const waistNavel = get('waistNavel', () => clamp(heightCm * (0.42 + 0.005 * bmi), 60, 160));
  const waistNarrow = get('waistNarrow', () => waistNavel - 3);
  const neck = get('neck', () => clamp(0.38 * waistNavel + 3, 32, 52));
  const chest = get('chest', () => Math.max(waistNavel * 1.03 + 2, neck * 2.3));
  const hip = get('hip', () => 0.95 * waistNavel + 8);
  const arm = get('arm', () => clamp(0.33 * chest + 1, 24, 52));
  const thigh = get('thigh', () => clamp(0.58 * hip + 1, 40, 85));
  const calf = get('calf', () => clamp(0.36 * hip + 2, 30, 52));
  return { m: { height: heightCm, neck, chest, waistNarrow, waistNavel, hip, arm, thigh, calf }, estimated: est };
}

/** Um retrato por data de medição, levando adiante a última medida conhecida de cada ponto. */
export function buildSnapshots(measurements: Measurement[], profile: Profile | null): Snapshot[] {
  const h = profile?.heightCm ?? 175;
  const known: Partial<Record<RingKey, number>> = {};
  let weight: number | undefined;
  const byDate = new Map<string, Measurement[]>();
  for (const m of sortedMeasurements(measurements)) {
    if (!byDate.has(m.date)) byDate.set(m.date, []);
    byDate.get(m.date)!.push(m);
  }
  const out: Snapshot[] = [];
  for (const [date, list] of byDate) {
    const today: RingKey[] = [];
    for (const m of list) {
      for (const k of Object.keys(FIELD) as RingKey[]) {
        const v = m[FIELD[k]];
        if (typeof v === 'number') {
          known[k] = v;
          if (!today.includes(k)) today.push(k);
        }
      }
      if (m.weight && (m.fasting || weight === undefined)) weight = m.weight;
    }
    if (!today.length && !list.some((m) => m.weight)) continue;
    const { m, estimated } = completeMeasures(known, h, weight);
    out.push({ date, m, weight, estimated, measuredToday: today });
  }
  return out;
}

export function lerpMeasures(a: BodyMeasures, b: BodyMeasures, t: number): BodyMeasures {
  const out = { ...a };
  for (const k of Object.keys(a) as (keyof BodyMeasures)[]) out[k] = a[k] + (b[k] - a[k]) * t;
  return out;
}
