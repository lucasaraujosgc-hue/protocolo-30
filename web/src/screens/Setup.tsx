import { useState } from 'react';
import { NumberField, Segmented, Switch } from '../components/ui';
import { api } from '../lib/api';
import { nowHHMM, todayISO } from '../lib/dates';
import { uid } from '../lib/engine';
import { DEFAULT_START, defaultSettings } from '../lib/schedule';
import type { RawState } from '../lib/types';

export function Setup({ onDone }: { onDone: (s: RawState) => void }) {
  const today = todayISO();
  const [name, setName] = useState('');
  const [height, setHeight] = useState<number | undefined>(undefined);
  const [age, setAge] = useState<number | undefined>(undefined);
  const [sex, setSex] = useState<'M' | 'F'>('M');
  const [start, setStart] = useState(today <= DEFAULT_START ? DEFAULT_START : today);
  const [weight, setWeight] = useState<number | undefined>(undefined);
  const [waist, setWaist] = useState<number | undefined>(undefined);
  const [fasting, setFasting] = useState(new Date().getHours() < 10);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setErr('');
    if (!height || !age) {
      setErr('Informe altura e idade.');
      return;
    }
    setBusy(true);
    try {
      await api.profile({ name: name || undefined, heightCm: height, age, sex });
      let s = await api.settings(defaultSettings(start));
      if (weight || waist) {
        s = await api.measurement({ id: uid(), date: today, time: nowHHMM(), fasting, weight, waistNavel: waist });
      }
      onDone(s);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erro ao salvar');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="center-screen">
      <div className="card glow hot" style={{ width: '100%', maxWidth: 440, padding: 22 }}>
        <div className="brand-name" style={{ fontSize: 16 }}>
          CONFIGURAÇÃO INICIAL
        </div>
        <div className="small muted" style={{ margin: '6px 0 16px' }}>
          Esses dados ficam só no seu servidor. O cardápio, os treinos e as metas já vêm do plano.
        </div>
        <div className="stack">
          <label className="field">
            <span>Nome (opcional)</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <div className="grid2">
            <NumberField label="Altura" value={height} onChange={setHeight} suffix="cm" placeholder="186" />
            <NumberField label="Idade" value={age} onChange={setAge} suffix="anos" decimals={false} placeholder="31" />
          </div>
          <div className="field">
            <span>Sexo (para as fórmulas de composição)</span>
            <Segmented
              options={[
                { value: 'M', label: 'Masculino' },
                { value: 'F', label: 'Feminino' },
              ]}
              value={sex}
              onChange={setSex}
            />
          </div>
          <label className="field">
            <span>Dia 1 do protocolo</span>
            <input className="input" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </label>
          <div className="label" style={{ marginTop: 6 }}>
            Primeira medição (opcional)
          </div>
          <div className="grid2">
            <NumberField label="Peso" value={weight} onChange={setWeight} suffix="kg" />
            <NumberField label="Cintura no umbigo" value={waist} onChange={setWaist} suffix="cm" />
          </div>
          <Switch on={fasting} onChange={setFasting} label="Medido em jejum, ao acordar" />
          {err && <div className="small neg">{err}</div>}
          <button className="btn primary block" onClick={save} disabled={busy}>
            {busy ? 'Salvando…' : 'Iniciar protocolo'}
          </button>
        </div>
      </div>
    </div>
  );
}
