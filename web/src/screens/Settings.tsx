import { Download, LogOut, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { NumberField, Sheet, Switch } from '../components/ui';
import { api } from '../lib/api';
import { fmtShort, weekdayShort } from '../lib/dates';
import { targetFor } from '../lib/engine';
import { fmtInt } from '../lib/format';
import { scheduleWarnings, SPIN_TEMPLATES } from '../lib/schedule';
import { useStore } from '../lib/store';
import type { Profile, Settings as S, TargetKey, TargetPeriod } from '../lib/types';

const TARGET_LABEL: Record<TargetKey, string> = {
  z2: `Spinning ${SPIN_TEMPLATES.z2.name}`,
  tempo: `Spinning ${SPIN_TEMPLATES.tempo.name}`,
  intervalado: `Spinning ${SPIN_TEMPLATES.intervalado.name}`,
  livre: 'Spinning livre',
  musculacao: 'Musculação',
  outro: 'Outro cardio',
};

export function SettingsSheet({ onClose }: { onClose: () => void }) {
  const { state, today, targets, saveSettings, saveProfile, replaceState, toast, logout } = useStore();
  const [s, setS] = useState<S>(() => structuredClone(state.settings));
  const [p, setP] = useState<Profile>(() => state.profile ?? { heightCm: 175, age: 30, sex: 'M' });
  const cur = targetFor(state.settings, today);
  const [t, setT] = useState<TargetPeriod>({ ...cur });
  const fileRef = useRef<HTMLInputElement>(null);
  const warnings = scheduleWarnings(s);

  const toggleDay = (key: 'liftDays' | 'legDays' | 'spinDays', d: number) => {
    const list = s[key].includes(d) ? s[key].filter((x) => x !== d) : [...s[key], d].sort();
    setS({ ...s, [key]: list });
  };

  const applyTarget = async () => {
    const from = today < s.startDate ? s.startDate : today;
    const others = s.targets.filter((x) => x.from !== from);
    const next = { ...s, targets: [...others, { ...t, from }].sort((a, b) => a.from.localeCompare(b.from)) };
    setS(next);
    await saveSettings(next);
  };

  const days = [1, 2, 3, 4, 5, 6, 0];

  return (
    <Sheet title="Ajustes" onClose={onClose} full>
      <div className="stack" style={{ paddingBottom: 40 }}>
        <div className="card">
          <div className="card-title">
            <h3>Perfil</h3>
          </div>
          <div className="stack">
            <label className="field">
              <span>Nome</span>
              <input className="input" value={p.name ?? ''} onChange={(e) => setP({ ...p, name: e.target.value || undefined })} />
            </label>
            <div className="grid2">
              <NumberField label="Altura" value={p.heightCm} onChange={(v) => setP({ ...p, heightCm: v ?? 0 })} suffix="cm" />
              <NumberField label="Idade" value={p.age} onChange={(v) => setP({ ...p, age: v ?? 0 })} suffix="anos" decimals={false} />
            </div>
            <button className="btn" onClick={() => saveProfile(p)}>
              Salvar perfil
            </button>
          </div>
        </div>

        <div className="card">
          <div className="card-title">
            <h3>Meta diária</h3>
            <span className="tiny muted">em vigor desde {fmtShort(cur.from)}</span>
          </div>
          <div className="grid2">
            <NumberField label="Calorias" value={t.kcal} onChange={(v) => setT({ ...t, kcal: v ?? 0 })} suffix="kcal" decimals={false} />
            <NumberField label="Passos" value={t.steps} onChange={(v) => setT({ ...t, steps: v ?? 0 })} decimals={false} />
            <NumberField label="Proteína" value={t.p} onChange={(v) => setT({ ...t, p: v ?? 0 })} suffix="g" decimals={false} />
            <NumberField label="Carboidrato" value={t.c} onChange={(v) => setT({ ...t, c: v ?? 0 })} suffix="g" decimals={false} />
            <NumberField label="Gordura" value={t.f} onChange={(v) => setT({ ...t, f: v ?? 0 })} suffix="g" decimals={false} />
          </div>
          <div className="tiny muted" style={{ margin: '8px 0' }}>
            Mudanças valem a partir de hoje; os dias anteriores mantêm a meta antiga no banco. Se a meta ficar abaixo do cardápio, o app mostra quanto cortar em cada refeição.
          </div>
          <button className="btn primary block" onClick={applyTarget}>
            Aplicar a partir de hoje
          </button>
          {s.targets.length > 1 && (
            <div className="list" style={{ marginTop: 10 }}>
              {[...s.targets].reverse().map((x) => (
                <div key={x.from} className="list-row small">
                  <span className="grow">desde {fmtShort(x.from)}</span>
                  <span className="num">
                    {fmtInt(x.kcal)} kcal · {fmtInt(x.steps)} passos
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-title">
            <h3>Agenda de treinos</h3>
          </div>
          <div className="stack">
            <label className="field">
              <span>Início do protocolo (dia 1)</span>
              <input className="input" type="date" value={s.startDate} onChange={(e) => setS({ ...s, startDate: e.target.value })} />
            </label>
            {(
              [
                ['spinDays', 'Dias de spinning'],
                ['liftDays', 'Dias de musculação'],
                ['legDays', 'Dias de perna (definidos pelo personal)'],
              ] as const
            ).map(([key, label]) => (
              <div key={key} className="field">
                <span>{label}</span>
                <div className="day-pick">
                  {days.map((d) => (
                    <button key={d} className={s[key].includes(d) ? 'on' : ''} onClick={() => toggleDay(key, d)}>
                      {weekdayShort(d)}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <div className="field">
              <span>Sessão mais forte (tempo / intervalado)</span>
              <div className="day-pick">
                {days.map((d) => (
                  <button key={d} className={s.hardDay === d ? 'on' : ''} onClick={() => setS({ ...s, hardDay: d })}>
                    {weekdayShort(d)}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid2">
              <label className="field">
                <span>Horário do spinning</span>
                <input className="input" type="time" value={s.spinTime} onChange={(e) => setS({ ...s, spinTime: e.target.value })} />
              </label>
              <label className="field">
                <span>Horário da musculação</span>
                <input className="input" type="time" value={s.liftTime} onChange={(e) => setS({ ...s, liftTime: e.target.value })} />
              </label>
            </div>
            <label className="field">
              <span>Intervalado liberado a partir de</span>
              <input className="input" type="date" value={s.intervalsFrom ?? ''} onChange={(e) => setS({ ...s, intervalsFrom: e.target.value || null })} />
            </label>
            {warnings.map((w) => (
              <div key={w} className="hint warn">
                {w}
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-title">
            <h3>Metas por treino (calorias ativas)</h3>
          </div>
          <Switch
            on={s.autoCalibrate}
            onChange={(v) => setS({ ...s, autoCalibrate: v })}
            label="Calibrar pelo seu relógio"
            hint="A meta de cada tipo vira a mediana das suas 3 primeiras sessões registradas."
          />
          <div className="grid2">
            {(Object.keys(TARGET_LABEL) as TargetKey[]).map((k) => (
              <div key={k}>
                <NumberField
                  label={TARGET_LABEL[k]}
                  value={s.exerciseTargets[k]}
                  onChange={(v) => setS({ ...s, exerciseTargets: { ...s.exerciseTargets, [k]: v ?? 0 } })}
                  suffix="kcal"
                  decimals={false}
                />
                {targets[k].calibrated && <div className="tiny cyan">calibrada: {fmtInt(targets[k].value)} kcal</div>}
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-title">
            <h3>Banco e compensação</h3>
          </div>
          <div className="field">
            <span>
              Créditos de treino e passos valem <b className="cyan">{Math.round(s.creditFactor * 100)}%</b>
            </span>
            <input type="range" min={50} max={100} step={5} value={Math.round(s.creditFactor * 100)} onChange={(e) => setS({ ...s, creditFactor: Number(e.target.value) / 100 })} />
          </div>
          <div className="grid2" style={{ marginTop: 8 }}>
            <NumberField label="Corte máximo de comida/dia" value={s.maxFoodCut} onChange={(v) => setS({ ...s, maxFoodCut: v ?? 0 })} suffix="kcal" decimals={false} />
            <NumberField label="Piso de calorias" value={s.foodFloor} onChange={(v) => setS({ ...s, foodFloor: v ?? 0 })} suffix="kcal" decimals={false} />
            <NumberField label="Atividade extra máx./dia" value={s.maxExtraActive} onChange={(v) => setS({ ...s, maxExtraActive: v ?? 0 })} suffix="kcal" decimals={false} />
          </div>
          <div className="tiny muted" style={{ marginTop: 8 }}>
            Não desça o piso abaixo de ~1.900 kcal sem acompanhamento: você treina duas vezes por dia.
          </div>
        </div>

        <button className="btn primary block" onClick={() => saveSettings(s)}>
          Salvar agenda e limites
        </button>

        <div className="card">
          <div className="card-title">
            <h3>Dados</h3>
          </div>
          <div className="stack">
            <a className="btn" href="/api/export" download>
              <Download size={16} /> Baixar backup (JSON)
            </a>
            <button className="btn" onClick={() => fileRef.current?.click()}>
              <Upload size={16} /> Restaurar backup
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (!f) return;
                if (!window.confirm('Restaurar este backup? Os dados atuais serão substituídos (uma cópia de segurança fica no servidor).')) return;
                try {
                  const raw = await api.importState(JSON.parse(await f.text()));
                  replaceState(raw);
                  toast('Backup restaurado');
                } catch (err) {
                  toast(err instanceof Error ? err.message : 'Arquivo inválido', 'err');
                }
              }}
            />
            <div className="tiny muted">O servidor também guarda uma cópia automática por dia (últimos 30 dias) no volume de dados.</div>
          </div>
        </div>

        <button className="btn danger block" onClick={logout}>
          <LogOut size={16} /> Sair
        </button>
      </div>
    </Sheet>
  );
}
