import { useState } from 'react';
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
      <form className="login-card card glow hot" onSubmit={submit} style={{ padding: 26 }}>
        <div className="orb" />
        <div>
          <div className="brand-name" style={{ fontSize: 18 }}>
            PROTOCOLO 30
          </div>
          <div className="tiny muted" style={{ marginTop: 6 }}>
            Dieta · treino · banco de calorias · holograma
          </div>
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
