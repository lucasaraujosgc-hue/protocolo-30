import { Activity, Dumbbell, Home as HomeIcon, Settings as Gear, UtensilsCrossed, Wallet } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Logo } from './components/ui';
import { api, ApiError } from './lib/api';
import { StoreProvider, useStore } from './lib/store';
import type { RawState } from './lib/types';
import { Bank } from './screens/Bank';
import { Home } from './screens/Home';
import { Login } from './screens/Login';
import { Plan } from './screens/Plan';
import { Progress } from './screens/Progress';
import { SettingsSheet } from './screens/Settings';
import { Setup } from './screens/Setup';
import { Training } from './screens/Training';

export type TabId = 'hoje' | 'plano' | 'treino' | 'banco' | 'progresso';

const TABS: { id: TabId; label: string; icon: typeof HomeIcon }[] = [
  { id: 'hoje', label: 'Hoje', icon: HomeIcon },
  { id: 'plano', label: 'Refeições', icon: UtensilsCrossed },
  { id: 'treino', label: 'Treino', icon: Dumbbell },
  { id: 'banco', label: 'Banco', icon: Wallet },
  { id: 'progresso', label: 'Progresso', icon: Activity },
];

export function App() {
  const [phase, setPhase] = useState<'loading' | 'login' | 'ready' | 'offline'>('loading');
  const [raw, setRaw] = useState<RawState | null>(null);

  const load = useCallback(async () => {
    try {
      const s = await api.state();
      setRaw(s);
      setPhase('ready');
    } catch (e) {
      setPhase(e instanceof ApiError && e.status === 401 ? 'login' : 'offline');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onUnauthorized = useCallback(() => setPhase('login'), []);

  if (phase === 'loading') {
    return (
      <div className="center-screen">
        <div className="spinner" />
      </div>
    );
  }
  if (phase === 'login') return <Login onDone={load} />;
  if (phase === 'offline' || !raw) {
    return (
      <div className="center-screen">
        <div className="card" style={{ maxWidth: 360, textAlign: 'center' }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Sem conexão com o servidor</div>
          <div className="small muted" style={{ marginBottom: 14 }}>
            Verifique a internet e tente de novo.
          </div>
          <button className="btn primary block" onClick={load}>
            Tentar de novo
          </button>
        </div>
      </div>
    );
  }
  if (!raw.profile || !raw.settings) return <Setup onDone={(s) => setRaw(s)} />;

  return (
    <StoreProvider initial={raw} onUnauthorized={onUnauthorized}>
      <Shell />
    </StoreProvider>
  );
}

function Shell() {
  const { state } = useStore();
  const [tab, setTab] = useState<TabId>(() => (sessionStorage.getItem('p30-tab') as TabId) || 'hoje');
  const [settings, setSettings] = useState(false);

  const go = useCallback((t: TabId) => {
    setTab(t);
    try {
      sessionStorage.setItem('p30-tab', t);
    } catch {
      /* armazenamento indisponível */
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  return (
    <>
      <div className="app">
        <header className="topbar">
          <div className="brand">
            <Logo />
            <div>
              <div className="brand-name">Protocolo 30</div>
              <div className="brand-sub">{state.profile?.name ? state.profile.name : 'painel pessoal'}</div>
            </div>
          </div>
          <button className="icon-btn" onClick={() => setSettings(true)} aria-label="Ajustes">
            <Gear size={19} />
          </button>
        </header>
        <main key={tab}>
          {tab === 'hoje' && <Home go={go} />}
          {tab === 'plano' && <Plan />}
          {tab === 'treino' && <Training />}
          {tab === 'banco' && <Bank />}
          {tab === 'progresso' && <Progress />}
        </main>
      </div>
      <nav className="tabbar">
        <div className="tabbar-inner">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button key={id} className={`tab ${tab === id ? 'on' : ''}`} onClick={() => go(id)}>
              <Icon size={21} strokeWidth={1.8} />
              {label}
            </button>
          ))}
        </div>
      </nav>
      {settings && <SettingsSheet onClose={() => setSettings(false)} />}
    </>
  );
}
