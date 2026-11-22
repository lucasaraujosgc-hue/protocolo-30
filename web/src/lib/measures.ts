import type { MeasureKey } from './types';

export interface MeasureMeta {
  key: MeasureKey;
  label: string;
  short: string;
  unit: string;
  group: 'Peso' | 'Tronco' | 'Membros' | 'Saúde';
  guide: string;
  /** Queda é boa? (para colorir a variação) */
  lowerIsBetter: boolean;
  color: string;
}

export const MEASURES: MeasureMeta[] = [
  {
    key: 'weight',
    label: 'Peso',
    short: 'Peso',
    unit: 'kg',
    group: 'Peso',
    guide: 'Ao acordar, depois de urinar e antes de beber água. Mesma balança, sem roupa ou com a mesma roupa. Marque "em jejum".',
    lowerIsBetter: true,
    color: '#2ee6ff',
  },
  {
    key: 'waistNavel',
    label: 'Cintura no umbigo',
    short: 'Cintura (umbigo)',
    unit: 'cm',
    group: 'Tronco',
    guide: 'Em pé, abdômen relaxado. Fita na linha do umbigo, paralela ao chão, no fim de uma expiração normal. Não encolha a barriga.',
    lowerIsBetter: true,
    color: '#ff4fd8',
  },
  {
    key: 'waistNarrow',
    label: 'Cintura no ponto mais estreito',
    short: 'Cintura (estreita)',
    unit: 'cm',
    group: 'Tronco',
    guide: 'No ponto mais fino entre a última costela e o osso do quadril, fim de uma expiração normal.',
    lowerIsBetter: true,
    color: '#c77dff',
  },
  {
    key: 'neck',
    label: 'Pescoço',
    short: 'Pescoço',
    unit: 'cm',
    group: 'Tronco',
    guide: 'Logo abaixo do pomo de Adão, com a fita levemente inclinada para baixo na frente. Olhe para a frente, ombros relaxados.',
    lowerIsBetter: true,
    color: '#6b8cff',
  },
  {
    key: 'chest',
    label: 'Peito',
    short: 'Peito',
    unit: 'cm',
    group: 'Tronco',
    guide: 'Na linha dos mamilos, braços relaxados ao lado do corpo, no fim de uma expiração normal.',
    lowerIsBetter: true,
    color: '#4dd8ff',
  },
  {
    key: 'hip',
    label: 'Quadril',
    short: 'Quadril',
    unit: 'cm',
    group: 'Tronco',
    guide: 'Na parte mais larga dos glúteos, com os pés juntos.',
    lowerIsBetter: true,
    color: '#ffc24d',
  },
  {
    key: 'armRelaxed',
    label: 'Braço relaxado',
    short: 'Braço',
    unit: 'cm',
    group: 'Membros',
    guide: 'Braço direito solto ao lado do corpo, no meio do caminho entre o ombro e o cotovelo.',
    lowerIsBetter: false,
    color: '#9dff6a',
  },
  {
    key: 'armFlexed',
    label: 'Braço contraído',
    short: 'Braço (contraído)',
    unit: 'cm',
    group: 'Membros',
    guide: 'Mesmo ponto do braço relaxado, com o cotovelo a 90° e o bíceps contraído.',
    lowerIsBetter: false,
    color: '#3dffa8',
  },
  {
    key: 'thigh',
    label: 'Coxa',
    short: 'Coxa',
    unit: 'cm',
    group: 'Membros',
    guide: 'Coxa direita, no meio entre a virilha e o joelho, em pé com o peso dividido nas duas pernas.',
    lowerIsBetter: false,
    color: '#ff8a5c',
  },
  {
    key: 'calf',
    label: 'Panturrilha',
    short: 'Panturrilha',
    unit: 'cm',
    group: 'Membros',
    guide: 'Panturrilha direita, na parte mais grossa, em pé.',
    lowerIsBetter: false,
    color: '#ffe066',
  },
  {
    key: 'restingHr',
    label: 'FC de repouso',
    short: 'FC repouso',
    unit: 'bpm',
    group: 'Saúde',
    guide: 'Média da semana no app Saúde do iPhone (Frequência cardíaca em repouso).',
    lowerIsBetter: true,
    color: '#ff5577',
  },
];

export const MEASURE_META: Record<MeasureKey, MeasureMeta> = Object.fromEntries(MEASURES.map((m) => [m.key, m])) as Record<
  MeasureKey,
  MeasureMeta
>;
