import { useState } from 'react';
import { Logo } from '../components/ui';
import { api } from '../lib/api';

export function Login({ onDone }: { onDone: () => void }) {
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      await api.login(pw);
      onDone();
    } catch (er) {
      setErr(er instanceof Error ? er.message : 'Erro');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="center-screen">
      <form className="login-card card" onSubmit={submit} style={{ padding: 26 }}>
        <div style={{ display: 'grid', justifyItems: 'center', gap: 10 }}>
          <Logo size={40} />
          <div className="brand-name" style={{ fontSize: 18 }}>
            Protocolo 30
          </div>
          <div className="small muted">Dieta, treino e evolução</div>
        </div>
        <input className="input" type="password" autoComplete="current-password" placeholder="Senha de acesso" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus />
        {err && <div className="small neg">{err}</div>}
        <button className="btn primary block" disabled={!pw || busy}>
          {busy ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}
