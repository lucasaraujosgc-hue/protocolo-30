export const fmtInt = (n: number) => Math.round(n).toLocaleString('pt-BR');

export const fmt1 = (n: number) =>
  n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export const fmtG = (n: number) => `${Math.round(n)} g`;

/** Sinal tipográfico (− em vez de -) para leitura clara. */
export function fmtSigned(n: number, digits = 0): string {
  const r = digits ? Math.round(n * 10 ** digits) / 10 ** digits : Math.round(n);
  if (r === 0) return digits ? (0).toFixed(digits).replace('.', ',') : '0';
  const abs = digits ? fmt1(Math.abs(r)) : fmtInt(Math.abs(r));
  return `${r > 0 ? '+' : '−'}${abs}`;
}

/** Aceita "106,5" e "106.5". */
export function parseNum(s: string | number | undefined | null): number | undefined {
  if (s === undefined || s === null) return undefined;
  if (typeof s === 'number') return Number.isFinite(s) ? s : undefined;
  const t = s.replace(/\s/g, '').replace(',', '.');
  if (!t) return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

export const numToInput = (n: number | undefined) => (n === undefined ? '' : String(n).replace('.', ','));

export const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));
