import { Copy, Download, FileUp, History, LogOut, Share2, Trash2, Upload } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { ProtocolUploadSheet } from '../components/ProtocolUpload';
import { NumberField, Sheet, Switch } from '../components/ui';
import { api } from '../lib/api';
import { fmtShort, weekdayShort } from '../lib/dates';
import { currentWeight } from '../lib/engine';
import { buildAiExport, buildBackup, buildProtocolFile } from '../lib/export';
import { fmtInt } from '../lib/format';
import { defaultFrom, diffProtocols, newId, protocolKey, sortProtocols, upsertVersion, validateProtocol } from '../lib/protocol';
import { copyText, fmtBytes, shareFile } from '../lib/share';
import { useStore } from '../lib/store';
import type { Profile, Protocol, TargetKey } from '../lib/types';
import { TARGET_KEYS } from '../lib/types';

const SOURCE_LABEL: Record<Protocol['source'], string> = {
  padrao: 'plano inicial',
  migracao: 'plano inicial',
  ajustes: 'editado aqui',
  arquivo: 'arquivo importado',
};

export function SettingsSheet({ onClose }: { onClose: () => void }) {
  const { logout, protocol } = useStore();
  const [upload, setUpload] = useState(false);
  // O editor recomeça do zero quando a versão em vigor muda (ex.: depois de importar um arquivo).
  const editorKey = useMemo(() => protocolKey(protocol), [protocol]);
  return (
    <Sheet title="Ajustes" onClose={onClose} full>
      <div className="stack" style={{ paddingBottom: 40 }}>
        <DataCard onUpload={() => setUpload(true)} />
        <ProtocolVersions />
        <ProfileCard />
        <StartDateCard />
        <ProtocolEditor key={editorKey} />
        <BackupCard />
        <button className="btn danger block" onClick={logout}>
          <LogOut size={16} /> Sair
        </button>
      </div>
      {upload && <ProtocolUploadSheet onClose={() => setUpload(false)} />}
    </Sheet>
  );
}

/* ------------------------------------------------------------- dados e IA */

function DataCard({ onUpload }: { onUpload: () => void }) {
  const { state, today, nowMin, toast } = useStore();
  const info = useMemo(() => buildAiExport(state, today, nowMin), [state, today, nowMin]);

  const share = async () => {
    // Gera de novo no toque (dados do minuto atual) e abre o compartilhamento na mesma ação.
    const exp = buildAiExport(state, today, nowMin);
    const r = await shareFile(exp.fileName, exp.json, { title: 'Evolução · Protocolo 30' });
    if (r === 'downloaded') toast('Arquivo salvo em Downloads', 'info');
  };

  const copy = async () => {
    const exp = buildAiExport(state, today, nowMin);
    toast((await copyText(exp.json)) ? 'Copiado. Cole numa conversa com a IA.' : 'Não consegui copiar neste aparelho', 'info');
  };

  return (
    <div className="card glow">
      <div className="card-title">
        <h3>Dados e IA</h3>
        <span className="tiny muted">
          {info.days} dia(s) · {fmtBytes(info.bytes)}
        </span>
      </div>
      <div className="stack">
        <button className="btn primary block" onClick={share}>
          <Share2 size={16} /> Exportar evolução (.json)
        </button>
        <button className="btn block" onClick={copy}>
          <Copy size={16} /> Copiar como texto
        </button>
        <button className="btn block" onClick={onUpload}>
          <FileUp size={16} /> Atualizar protocolo (.json)
        </button>
        <div className="tiny muted">
          A exportação traz tudo (perfil, protocolo, dias, treinos, medidas, banco) e um prompt pronto: envie numa conversa nova comigo ou com outra IA. Se
          a IA sugerir mudanças no cardápio, metas ou treinos, ela devolve um .json que você sobe em “Atualizar protocolo”.
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- versões */

function ProtocolVersions() {
  const { state, protocol, saveProtocols, toast } = useStore();
  const [open, setOpen] = useState(false);
  const versions = sortProtocols(state.protocols);

  const remove = async (v: Protocol) => {
    const i = versions.findIndex((x) => x.id === v.id);
    const prev = versions[i - 1] ?? versions[i + 1];
    if (!window.confirm(`Apagar a versão “${v.name}”? Os dias dela passam a usar “${prev?.name ?? 'a versão anterior'}”.`)) return;
    let list = versions.filter((x) => x.id !== v.id);
    // A primeira versão sempre cobre o início do protocolo.
    if (i === 0 && list.length) list = list.map((x, j) => (j === 0 ? { ...x, from: v.from } : x));
    await saveProtocols(list, 'Versão apagada');
  };

  const exportVersion = async (v: Protocol) => {
    const f = buildProtocolFile(v);
    const r = await shareFile(f.fileName, f.json, { title: `Protocolo · ${v.name}` });
    if (r === 'downloaded') toast('Arquivo salvo em Downloads', 'info');
  };

  return (
    <div className="card">
      <div className="card-title">
        <h3>Protocolo em vigor</h3>
        <span className="tiny muted">desde {fmtShort(protocol.from)}</span>
      </div>
      <div style={{ fontWeight: 600 }}>{protocol.name}</div>
      <div className="tiny muted" style={{ marginTop: 2 }}>
        {fmtInt(protocol.targets.kcal)} kcal · P {protocol.targets.p} g · C {protocol.targets.c} g · G {protocol.targets.f} g · {fmtInt(protocol.targets.steps)} passos ·{' '}
        {SOURCE_LABEL[protocol.source]}
      </div>
      {protocol.notes && (
        <div className="small" style={{ marginTop: 8, whiteSpace: 'pre-wrap' }}>
          {protocol.notes}
        </div>
      )}
      <div className="row" style={{ marginTop: 10, gap: 8 }}>
        <button className="btn sm" onClick={() => exportVersion(protocol)}>
          <Download size={14} /> Baixar este protocolo
        </button>
        <button className="btn sm ghost" onClick={() => setOpen(!open)}>
          <History size={14} /> Versões ({versions.length})
        </button>
      </div>
      {open && (
        <div className="list" style={{ marginTop: 10 }}>
          {[...versions].reverse().map((v, i, arr) => {
            const older = arr[i + 1];
            const changes = older ? diffProtocols(older, v).reduce((a, s) => a + s.lines.length, 0) : 0;
            return (
              <div key={v.id} className="list-row" style={{ alignItems: 'flex-start' }}>
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="ellipsis" style={{ fontWeight: v.id === protocol.id ? 700 : 500 }}>
                    {v.name}
                    {v.id === protocol.id ? ' · em vigor' : v.from > protocol.from ? ' · futura' : ''}
                  </div>
                  <div className="tiny dim">
                    desde {fmtShort(v.from)} · {SOURCE_LABEL[v.source]}
                    {older ? ` · ${changes} mudança(s)` : ''}
                  </div>
                </div>
                <button className="icon-btn" aria-label="Baixar versão" onClick={() => exportVersion(v)}>
                  <Download size={15} />
                </button>
                {versions.length > 1 && (
                  <button className="icon-btn" aria-label="Apagar versão" onClick={() => remove(v)}>
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------- perfil */

function ProfileCard() {
  const { state, saveProfile } = useStore();
  const [p, setP] = useState<Profile>(() => state.profile ?? { heightCm: 175, age: 30, sex: 'M' });
  return (
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
  );
}

function StartDateCard() {
  const { state, saveSettings, saveProtocols } = useStore();
  const [start, setStart] = useState(state.settings.startDate);
  const changed = start !== state.settings.startDate && /^\d{4}-\d{2}-\d{2}$/.test(start);

  const save = async () => {
    const old = state.settings.startDate;
    if (!(await saveSettings({ ...state.settings, startDate: start }))) return;
    // A primeira versão acompanha o início do protocolo.
    const versions = sortProtocols(state.protocols);
    if (versions[0] && versions[0].from === old && !versions.some((v, i) => i > 0 && v.from <= start)) {
      await saveProtocols([{ ...versions[0], from: start }, ...versions.slice(1)], 'Início atualizado');
    }
  };

  return (
    <div className="card">
      <div className="card-title">
        <h3>Início do protocolo</h3>
      </div>
      <label className="field">
        <span>Dia 1</span>
        <input className="input" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
      </label>
      {changed && (
        <button className="btn block" style={{ marginTop: 10 }} onClick={save}>
          Salvar novo início
        </button>
      )}
    </div>
  );
}

/* --------------------------------------------------- edição rápida (versão) */

function ProtocolEditor() {
  const { state, today, protocol, targets, saveProtocols } = useStore();
  const [d, setD] = useState<Protocol>(() => structuredClone(protocol));
  const start = state.settings.startDate;
  const minFrom = protocol.from > start ? protocol.from : start;
  const [from, setFrom] = useState(() => {
    const f = defaultFrom(today, start);
    return f < minFrom ? minFrom : f;
  });
  const other = state.protocols.find((v) => v.from === from && v.id !== protocol.id);
  const dirty = JSON.stringify(d) !== JSON.stringify(protocol);
  const sameDay = from === protocol.from;
  const t = d.training;
  const b = d.bank;
  const check = useMemo(
    () => validateProtocol({ ...d, from }, { today, startDate: start, weightKg: currentWeight(state, today, 0) || undefined }),
    [d, from, today, start, state],
  );
  const days = [1, 2, 3, 4, 5, 6, 0];
  const setT = (patch: Partial<Protocol['training']>) => setD({ ...d, training: { ...t, ...patch } });
  const setB = (patch: Partial<Protocol['bank']>) => setD({ ...d, bank: { ...b, ...patch } });
  const toggleDay = (key: 'liftDays' | 'legDays' | 'spinDays', day: number) => {
    const list = t[key].includes(day) ? t[key].filter((x) => x !== day) : [...t[key], day].sort();
    setT({ [key]: list });
  };
  const label = (k: TargetKey) =>
    k === 'musculacao' ? 'Musculação' : k === 'outro' ? 'Outro cardio' : k === 'livre' ? 'Spinning livre' : `Spinning ${t.sessions[k].name}`;

  const save = async () => {
    if (check.errors.length) return;
    const version: Protocol = sameDay
      ? { ...d, from }
      : { ...d, id: newId(), from, createdAt: new Date().toISOString(), source: 'ajustes', name: `Ajustes de ${fmtShort(from)}`, notes: undefined };
    if (await saveProtocols(upsertVersion(state.protocols, version), `Protocolo salvo a partir de ${fmtShort(from)}`)) setD(structuredClone(version));
  };

  return (
    <>
      <div className="card">
        <div className="card-title">
          <h3>Meta diária</h3>
        </div>
        <div className="grid2">
          <NumberField label="Calorias" value={d.targets.kcal} onChange={(v) => setD({ ...d, targets: { ...d.targets, kcal: v ?? 0 } })} suffix="kcal" decimals={false} />
          <NumberField label="Passos" value={d.targets.steps} onChange={(v) => setD({ ...d, targets: { ...d.targets, steps: v ?? 0 } })} decimals={false} />
          <NumberField label="Proteína" value={d.targets.p} onChange={(v) => setD({ ...d, targets: { ...d.targets, p: v ?? 0 } })} suffix="g" decimals={false} />
          <NumberField label="Carboidrato" value={d.targets.c} onChange={(v) => setD({ ...d, targets: { ...d.targets, c: v ?? 0 } })} suffix="g" decimals={false} />
          <NumberField label="Gordura" value={d.targets.f} onChange={(v) => setD({ ...d, targets: { ...d.targets, f: v ?? 0 } })} suffix="g" decimals={false} />
        </div>
        <div className="tiny muted" style={{ marginTop: 8 }}>
          Se a meta ficar abaixo do cardápio ({fmtInt(check.menuKcal)} kcal), o app mostra quanto cortar em cada refeição.
        </div>
      </div>

      <div className="card">
        <div className="card-title">
          <h3>Agenda de treinos</h3>
        </div>
        <div className="stack">
          {(
            [
              ['spinDays', 'Dias de spinning'],
              ['liftDays', 'Dias de musculação'],
              ['legDays', 'Dias de perna (definidos pelo personal)'],
            ] as const
          ).map(([key, text]) => (
            <div key={key} className="field">
              <span>{text}</span>
              <div className="day-pick">
                {days.map((day) => (
                  <button key={day} className={t[key].includes(day) ? 'on' : ''} onClick={() => toggleDay(key, day)}>
                    {weekdayShort(day)}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <div className="field">
            <span>Sessão mais forte (tempo / intervalado)</span>
            <div className="day-pick">
              {days.map((day) => (
                <button key={day} className={t.hardDay === day ? 'on' : ''} onClick={() => setT({ hardDay: day })}>
                  {weekdayShort(day)}
                </button>
              ))}
            </div>
          </div>
          <div className="grid2">
            <label className="field">
              <span>Horário do spinning</span>
              <input className="input" type="time" value={t.spinTime} onChange={(e) => e.target.value && setT({ spinTime: e.target.value })} />
            </label>
            <label className="field">
              <span>Horário da musculação</span>
              <input className="input" type="time" value={t.liftTime} onChange={(e) => e.target.value && setT({ liftTime: e.target.value })} />
            </label>
          </div>
          <label className="field">
            <span>Intervalado liberado a partir de</span>
            <input className="input" type="date" value={t.intervalsFrom ?? ''} onChange={(e) => setT({ intervalsFrom: e.target.value || null })} />
          </label>
        </div>
      </div>

      <div className="card">
        <div className="card-title">
          <h3>Metas por treino (calorias ativas)</h3>
        </div>
        <Switch
          on={b.autoCalibrate}
          onChange={(v) => setB({ autoCalibrate: v })}
          label="Calibrar pelo seu relógio"
          hint="A meta de cada tipo vira a mediana das suas 3 primeiras sessões registradas."
        />
        <div className="grid2">
          {TARGET_KEYS.map((k) => (
            <div key={k}>
              <NumberField
                label={label(k)}
                value={t.exerciseTargets[k]}
                onChange={(v) => setT({ exerciseTargets: { ...t.exerciseTargets, [k]: v ?? 0 } })}
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
            Créditos de treino e passos valem <b className="cyan">{Math.round(b.creditFactor * 100)}%</b>
          </span>
          <input type="range" min={50} max={100} step={5} value={Math.round(b.creditFactor * 100)} onChange={(e) => setB({ creditFactor: Number(e.target.value) / 100 })} />
        </div>
        <div className="grid2" style={{ marginTop: 8 }}>
          <NumberField label="Corte máximo de comida/dia" value={b.maxFoodCut} onChange={(v) => setB({ maxFoodCut: v ?? 0 })} suffix="kcal" decimals={false} />
          <NumberField label="Piso de calorias" value={b.foodFloor} onChange={(v) => setB({ foodFloor: v ?? 0 })} suffix="kcal" decimals={false} />
          <NumberField label="Atividade extra máx./dia" value={b.maxExtraActive} onChange={(v) => setB({ maxExtraActive: v ?? 0 })} suffix="kcal" decimals={false} />
        </div>
        <div className="tiny muted" style={{ marginTop: 8 }}>
          Não desça o piso abaixo de ~1.900 kcal sem acompanhamento: você treina duas vezes por dia.
        </div>
      </div>

      {dirty && (
        <div className="card hot">
          <label className="field">
            <span>As mudanças valem a partir de</span>
            <input
              className="input"
              type="date"
              min={minFrom}
              value={from}
              onChange={(e) => e.target.value && setFrom(e.target.value < minFrom ? minFrom : e.target.value)}
            />
          </label>
          <div className="tiny muted" style={{ margin: '8px 0' }}>
            {sameDay
              ? `Altera a versão “${protocol.name}”, que começa nesse dia.`
              : `Cria a versão “Ajustes de ${fmtShort(from)}”. Os dias anteriores mantêm as regras antigas no banco.`}
            {other ? ` Substitui a versão “${other.name}”, que começa nesse dia.` : ''}
          </div>
          {check.errors.map((e) => (
            <div key={e} className="hint bad" style={{ marginBottom: 6 }}>
              {e}
            </div>
          ))}
          {check.warnings.map((w) => (
            <div key={w} className="hint warn" style={{ marginBottom: 6 }}>
              {w}
            </div>
          ))}
          <div className="row" style={{ gap: 8 }}>
            <button className="btn primary grow" disabled={check.errors.length > 0} onClick={save}>
              Salvar mudanças
            </button>
            <button className="btn ghost" onClick={() => setD(structuredClone(protocol))}>
              Descartar
            </button>
          </div>
        </div>
      )}
    </>
  );
}

/* -------------------------------------------------------------- backup */

function BackupCard() {
  const { state, today, replaceState, toast } = useStore();
  const fileRef = useRef<HTMLInputElement>(null);

  const backup = async () => {
    const f = buildBackup(state, today);
    const r = await shareFile(f.fileName, f.json, { title: 'Backup · Protocolo 30' });
    if (r === 'downloaded') toast('Backup salvo em Downloads', 'info');
  };

  return (
    <div className="card">
      <div className="card-title">
        <h3>Backup</h3>
      </div>
      <div className="stack">
        <button className="btn" onClick={backup}>
          <Download size={16} /> Salvar backup completo
        </button>
        <button className="btn" onClick={() => fileRef.current?.click()}>
          <Upload size={16} /> Restaurar backup
        </button>
        <input
          ref={fileRef}
          type="file"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            try {
              const data = JSON.parse(await f.text());
              if (data?.tipo === 'protocolo-30/exportacao') {
                toast('Esse é o arquivo para IA. Para restaurar, use o backup completo.', 'err');
                return;
              }
              if (data?.tipo === 'protocolo-30/protocolo') {
                toast('Esse é um arquivo de protocolo: use “Atualizar protocolo”.', 'err');
                return;
              }
              if (!window.confirm('Restaurar este backup? Os dados atuais serão substituídos (uma cópia de segurança fica no servidor).')) return;
              const raw = await api.importState(data);
              replaceState(raw);
              toast('Backup restaurado');
            } catch (err) {
              toast(err instanceof SyntaxError ? 'O arquivo não é um JSON válido.' : err instanceof Error ? err.message : 'Arquivo inválido', 'err');
            }
          }}
        />
        <div className="tiny muted">O servidor também guarda uma cópia automática por dia (últimos 30 dias) no volume de dados.</div>
      </div>
    </div>
  );
}
