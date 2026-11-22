import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, ApiError } from './api';
import { nowMinutes, todayISO } from './dates';
import { bankSummary, emptyDay, exerciseTargets, type BankSummary, type TargetInfo } from './engine';
import { withDefaults } from './schedule';
import type { AppState, Compensation, DayLog, Measurement, Profile, RawState, Settings, TargetKey } from './types';

export type ToastKind = 'ok' | 'err' | 'info';

interface StoreValue {
  state: AppState;
  today: string;
  nowMin: number;
  targets: Record<TargetKey, TargetInfo>;
  bank: BankSummary;
  saveDay: (date: string, fn: (d: DayLog) => DayLog | void) => Promise<boolean>;
  saveMeasurement: (m: Measurement) => Promise<boolean>;
  deleteMeasurement: (id: string) => Promise<boolean>;
  saveSettings: (s: Settings) => Promise<boolean>;
  saveProfile: (p: Profile) => Promise<boolean>;
  saveCompensation: (c: Compensation | null) => Promise<boolean>;
  replaceState: (raw: RawState) => void;
  toast: (msg: string, kind?: ToastKind) => void;
  logout: () => Promise<void>;
}

const Ctx = createContext<StoreValue | null>(null);

export function normalize(raw: RawState): AppState {
  return {
    version: 1,
    profile: raw.profile ?? null,
    settings: withDefaults(raw.settings),
    days: raw.days ?? {},
    measurements: raw.measurements ?? [],
    compensation: raw.compensation ?? null,
    updatedAt: raw.updatedAt ?? '',
  };
}

interface Toast {
  id: number;
  msg: string;
  kind: ToastKind;
}

export function StoreProvider({
  initial,
  onUnauthorized,
  children,
}: {
  initial: RawState;
  onUnauthorized: () => void;
  children: ReactNode;
}) {
  const [state, setState] = useState<AppState>(() => normalize(initial));
  const [clock, setClock] = useState(() => ({ today: todayISO(), nowMin: nowMinutes() }));
  const [toasts, setToasts] = useState<Toast[]>([]);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    const tick = () => setClock({ today: todayISO(), nowMin: nowMinutes() });
    const id = window.setInterval(tick, 30000);
    const onVis = () => document.visibilityState === 'visible' && tick();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  // Recarrega do servidor ao voltar para o app (outro aparelho pode ter salvo algo).
  useEffect(() => {
    const onVis = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        setState(normalize(await api.state()));
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) onUnauthorized();
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [onUnauthorized]);

  const toast = useCallback((msg: string, kind: ToastKind = 'ok') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, msg, kind }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);

  const run = useCallback(
    async (optimistic: AppState | null, call: () => Promise<RawState>, okMsg?: string) => {
      const prev = stateRef.current;
      if (optimistic) setState(optimistic);
      try {
        const res = await call();
        setState(normalize(res));
        if (okMsg) toast(okMsg);
        return true;
      } catch (e) {
        setState(prev);
        if (e instanceof ApiError && e.status === 401) {
          onUnauthorized();
          return false;
        }
        toast(e instanceof Error ? e.message : 'Erro ao salvar.', 'err');
        return false;
      }
    },
    [onUnauthorized, toast],
  );

  const saveDay = useCallback(
    (date: string, fn: (d: DayLog) => DayLog | void) => {
      const cur = structuredClone(stateRef.current.days[date] ?? emptyDay());
      const next = (fn(cur) ?? cur) as DayLog;
      const s = stateRef.current;
      return run({ ...s, days: { ...s.days, [date]: next } }, () => api.day(date, next));
    },
    [run],
  );

  const saveMeasurement = useCallback(
    (m: Measurement) => {
      const s = stateRef.current;
      const list = s.measurements.some((x) => x.id === m.id)
        ? s.measurements.map((x) => (x.id === m.id ? m : x))
        : [...s.measurements, m];
      return run({ ...s, measurements: list }, () => api.measurement(m), 'Medida salva');
    },
    [run],
  );

  const deleteMeasurement = useCallback(
    (id: string) => {
      const s = stateRef.current;
      return run({ ...s, measurements: s.measurements.filter((x) => x.id !== id) }, () => api.deleteMeasurement(id), 'Medida apagada');
    },
    [run],
  );

  const saveSettings = useCallback(
    (settings: Settings) => run({ ...stateRef.current, settings }, () => api.settings(settings), 'Ajustes salvos'),
    [run],
  );

  const saveProfile = useCallback(
    (profile: Profile) => run({ ...stateRef.current, profile }, () => api.profile(profile), 'Perfil salvo'),
    [run],
  );

  const saveCompensation = useCallback(
    (c: Compensation | null) => run({ ...stateRef.current, compensation: c }, () => api.compensation(c)),
    [run],
  );

  const replaceState = useCallback((raw: RawState) => setState(normalize(raw)), []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      onUnauthorized();
    }
  }, [onUnauthorized]);

  const targets = useMemo(() => exerciseTargets(state), [state]);
  const bank = useMemo(
    () => bankSummary(state, { today: clock.today, nowMin: clock.nowMin, targets }),
    [state, clock, targets],
  );

  const value: StoreValue = {
    state,
    today: clock.today,
    nowMin: clock.nowMin,
    targets,
    bank,
    saveDay,
    saveMeasurement,
    deleteMeasurement,
    saveSettings,
    saveProfile,
    saveCompensation,
    replaceState,
    toast,
    logout,
  };

  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            {t.msg}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useStore(): StoreValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useStore fora do StoreProvider');
  return v;
}
