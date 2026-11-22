import type { Compensation, DayLog, Measurement, Profile, RawState, Settings } from './types';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function req<T>(method: string, url: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      credentials: 'same-origin',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'Sem conexão com o servidor.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error || `Erro ${res.status}`);
  return data as T;
}

export const api = {
  state: () => req<RawState>('GET', '/api/state'),
  login: (password: string) => req<{ ok: true }>('POST', '/api/login', { password }),
  logout: () => req<{ ok: true }>('POST', '/api/logout', {}),
  profile: (p: Profile) => req<RawState>('PUT', '/api/profile', p),
  settings: (s: Settings) => req<RawState>('PUT', '/api/settings', s),
  day: (date: string, d: DayLog) => req<RawState>('PUT', `/api/day/${date}`, d),
  measurement: (m: Measurement) => req<RawState>('PUT', `/api/measurements/${m.id}`, m),
  deleteMeasurement: (id: string) => req<RawState>('DELETE', `/api/measurements/${id}`, {}),
  compensation: (c: Compensation | null) => req<RawState>('PUT', '/api/compensation', { compensation: c }),
  importState: (s: unknown) => req<RawState>('POST', '/api/import', s),
};
