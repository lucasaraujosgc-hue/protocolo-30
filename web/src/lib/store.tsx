import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, ApiError } from './api';
import { isISODate, nowMinutes, todayISO } from './dates';
import { bankSummary, calibrationSamples, emptyDay, exerciseTargets, protoAt, type BankSummary, type Samples, type TargetInfo } from './engine';
import { planOf, type Plan } from './plan';
import { completeProtocol, migrateLegacy, sortProtocols } from './protocol';
import { DEFAULT_START } from './schedule';
import type { AppState, Compensation, DayLog, Measurement, Profile, Protocol, RawState, Settings, TargetKey } from './types';

export type ToastKind = 'ok' | 'err' | 'info';

interface StoreValue {
  state: AppState;
  today: string;
  nowMin: number;
  /** Versão do protocolo em vigor hoje e o cardápio resolvido dela. */
  protocol: Protocol;
  plan: Plan;
  samples: Samples;
  targets: Record<TargetKey, TargetInfo>;
  bank: BankSummary;
  saveDay: (date: string, fn: (d: DayLog) => DayLog | void) => Promise<boolean>;
  saveMeasurement: (m: Measurement) => Promise<boolean>;
  deleteMeasurement: (id: string) => Promise<boolean>;
  saveSettings: (s: Settings) => Promise<boolean>;
  saveProtocols: (list: Protocol[], okMsg?: string) => Promise<boolean>;
  saveProfile: (p: Profile) => Promise<boolean>;
  saveCompensation: (c: Compensation | null) => Promise<boolean>;
  replaceState: (raw: RawState) => void;
  toast: (msg: string, kind?: ToastKind) => void;
  logout: () => Promise<void>;
}

const Ctx = createContext<StoreValue | null>(null);

/** Estado do servidor → estado do app. Instalações antigas (sem protocolo versionado) são migradas. */
export function normalize(raw: RawState): { state: AppState; migrated: boolean } {
  const startDate = isISODate(raw.settings?.startDate) ? raw.settings!.startDate! : DEFAULT_START;
  const stored = Array.isArray(raw.protocols) ? raw.protocols.filter((p) => p && isISODate(p.from)) : [];
  const migrated = stored.length === 0;
  const protocols = migrated ? migrateLegacy(raw.settings, startDate) : sortProtocols(stored.map((p) => completeProtocol(p)));
  return {
    state: {
      version: 2,
      profile: raw.profile ?? null,
      settings: { startDate },
      protocols,
      days: raw.days ?? {},
      measurements: raw.measurements ?? [],
      compensation: raw.compensation ?? null,
      updatedAt: raw.updatedAt ?? '',
    },
    // Só grava a migração quando já havia configuração (a tela inicial grava o protocolo padrão).
    migrated: migrated && !!raw.settings,
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
  const first = useMemo(() => normalize(initial), [initial]);
  const [state, setState] = useState<AppState>(first.state);
  const [clock, setClock] = useState(() => ({ today: todayISO(), nowMin: nowMinutes() }));
  const [toasts, setToasts] = useState<Toast[]>([]);
  const stateRef = useRef(state);
  stateRef.current = state;

  const toast = useCallback((msg: string, kind: ToastKind = 'ok') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, msg, kind }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);

  /** Aplica um estado vindo do servidor; se precisou migrar, grava o protocolo migrado. */
  const adopt = useCallback(
    (raw: RawState) => {
      const n = normalize(raw);
      setState(n.state);
      if (n.migrated) {
        api
          .protocols(n.state.protocols)
          .then((res) => setState(normalize(res).state))
          .catch((e) => {
            if (e instanceof ApiError && e.status === 401) onUnauthorized();
          });
      }
    },
    [onUnauthorized],
  );

  useEffect(() => {
    if (first.migrated) adopt(initial);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const tick = () => setClock((c) => {
      const next = { today: todayISO(), nowMin: nowMinutes() };
      return c.today === next.today && c.nowMin === next.nowMin ? c : next;
    });
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
        adopt(await api.state());
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) onUnauthorized();
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [adopt, onUnauthorized]);

  const run = useCallback(
    async (optimistic: AppState | null, call: () => Promise<RawState>, okMsg?: string) => {
      const prev = stateRef.current;
      if (optimistic) setState(optimistic);
      try {
        const res = await call();
        setState(normalize(res).state);
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

  const saveProtocols = useCallback(
    (list: Protocol[], okMsg = 'Protocolo salvo') => {
      const protocols = sortProtocols(list);
      return run({ ...stateRef.current, protocols }, () => api.protocols(protocols), okMsg);
    },
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

  const replaceState = useCallback((raw: RawState) => adopt(raw), [adopt]);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      onUnauthorized();
    }
  }, [onUnauthorized]);

  const protocol = useMemo(() => protoAt(state, clock.today), [state, clock.today]);
  const plan = planOf(protocol);
  const samples = useMemo(() => calibrationSamples(state), [state]);
  const targets = useMemo(() => exerciseTargets(protocol, samples), [protocol, samples]);
  const bank = useMemo(
    () => bankSummary(state, { today: clock.today, nowMin: clock.nowMin, samples }),
    [state, clock, samples],
  );

  const value: StoreValue = {
    state,
    today: clock.today,
    nowMin: clock.nowMin,
    protocol,
    plan,
    samples,
    targets,
    bank,
    saveDay,
    saveMeasurement,
    deleteMeasurement,
    saveSettings,
    saveProtocols,
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
