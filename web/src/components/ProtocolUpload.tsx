import { ClipboardPaste, FileUp } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { addDays, fmtShort, rangeDates } from '../lib/dates';
import { currentWeight } from '../lib/engine';
import { fmtInt } from '../lib/format';
import {
  diffProtocols,
  mergeProtocol,
  parseProtocolInput,
  protocolFor,
  sortProtocols,
  upsertVersion,
  validateProtocol,
  type ParsedProtocol,
} from '../lib/protocol';
import { useStore } from '../lib/store';
import { Sheet } from './ui';

/** Importa um arquivo de protocolo (gerado por IA ou editado à mão) e cria uma nova versão com data de início. */
export function ProtocolUploadSheet({ onClose, onApplied }: { onClose: () => void; onApplied?: () => void }) {
  const { state, today, saveProtocols } = useStore();
  const start = state.settings.startDate;
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [paste, setPaste] = useState(false);
  const [source, setSource] = useState('');
  const [parsed, setParsed] = useState<ParsedProtocol | null>(null);
  const [error, setError] = useState('');
  // Sem data no arquivo, a nova versão começa amanhã: não mexe nos registros de hoje.
  const fallbackFrom = today < start ? start : addDays(today, 1);
  const [from, setFrom] = useState(fallbackFrom);
  const [fromNote, setFromNote] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const read = (raw: string, label: string) => {
    setError('');
    setParsed(null);
    try {
      const p = parseProtocolInput(raw);
      let f = p.from ?? fallbackFrom;
      let note = '';
      if (p.from && p.from < start) {
        f = start;
        note = `O arquivo pedia ${fmtShort(p.from)}, antes do início do protocolo; ajustei para ${fmtShort(start)}.`;
      } else if (p.from && p.from < today) {
        note = `O arquivo começa em ${fmtShort(p.from)}, no passado. Se preferir, troque para hoje.`;
      }
      setParsed(p);
      setFrom(f);
      setFromNote(note);
      setName(p.name ?? '');
      setSource(label);
      setPaste(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não consegui ler o arquivo.');
    }
  };

  const base = useMemo(() => protocolFor(state.protocols, from), [state.protocols, from]);
  const next = useMemo(() => {
    if (!parsed) return null;
    const v = mergeProtocol(base, parsed, from);
    if (name.trim()) v.name = name.trim().slice(0, 80);
    return v;
  }, [base, parsed, from, name]);
  const check = useMemo(
    () => (next ? validateProtocol(next, { today, startDate: start, weightKg: currentWeight(state, today, 0) || undefined }) : null),
    [next, today, start, state],
  );
  const diff = useMemo(() => (next ? diffProtocols(base, next) : []), [base, next]);
  const replaced = state.protocols.find((p) => p.from === from);
  const later = sortProtocols(state.protocols).filter((p) => p.from > from);
  const errors = [...(check?.errors ?? [])];
  if (from < start) errors.unshift(`A data não pode ser anterior ao início do protocolo (${fmtShort(start)}).`);
  // Registros já feitos em refeições que deixam de existir continuam contando, mas como "fora do cardápio".
  const orphanWarn = useMemo(() => {
    if (!next || from > today) return '';
    const ids = new Set(next.meals.map((m) => m.id));
    const hit = new Set<string>();
    for (const d of rangeDates(from, today)) for (const id of Object.keys(state.days[d]?.meals ?? {})) if (!ids.has(id)) hit.add(id);
    return hit.size
      ? `Já há registros a partir de ${fmtShort(from)} em refeições que não existem no novo cardápio (${[...hit].join(', ')}). Eles continuam contando, mas como “fora do cardápio”. Para não misturar, comece amanhã.`
      : '';
  }, [next, from, today, state.days]);

  const apply = async () => {
    if (!next || errors.length) return;
    setBusy(true);
    const ok = await saveProtocols(upsertVersion(state.protocols, next), `Protocolo atualizado a partir de ${fmtShort(from)}`);
    setBusy(false);
    if (ok) {
      onApplied?.();
      onClose();
    }
  };

  return (
    <Sheet title="Atualizar protocolo" onClose={onClose} full>
      <div className="stack" style={{ paddingBottom: 40 }}>
        {!parsed && (
          <>
            <div className="hint">
              Envie o arquivo <b>.json</b> que a IA gerou (ou cole o texto da resposta). Pode ser o protocolo inteiro ou só a parte que mudou: o que não vier no
              arquivo continua igual. Antes de aplicar, você vê tudo o que muda.
            </div>
            <button className="btn primary block" onClick={() => fileRef.current?.click()}>
              <FileUp size={16} /> Escolher arquivo
            </button>
            <input
              ref={fileRef}
              type="file"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (!f) return;
                if (f.size > 2 * 1024 * 1024) {
                  setError('Arquivo grande demais para um protocolo (máximo de 2 MB).');
                  return;
                }
                read(await f.text(), f.name);
              }}
            />
            {!paste ? (
              <button className="btn block" onClick={() => setPaste(true)}>
                <ClipboardPaste size={16} /> Colar texto
              </button>
            ) : (
              <div className="stack">
                <textarea
                  className="input"
                  rows={8}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder='Cole aqui o JSON (começa com { e termina com }). Pode colar a resposta inteira da IA.'
                  autoFocus
                />
                <button className="btn primary block" disabled={!text.trim()} onClick={() => read(text, 'texto colado')}>
                  Ler texto
                </button>
              </div>
            )}
            {error && <div className="hint bad">{error}</div>}
          </>
        )}

        {parsed && next && check && (
          <>
            <div className="card">
              <div className="row between">
                <span className="label">Arquivo</span>
                <button
                  className="btn sm ghost"
                  onClick={() => {
                    setParsed(null);
                    setText('');
                  }}
                >
                  Trocar
                </button>
              </div>
              <div className="small ellipsis" style={{ marginTop: 4 }}>
                {source}
              </div>
              <label className="field" style={{ marginTop: 10 }}>
                <span>Nome da versão</span>
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={next.name} maxLength={80} />
              </label>
              <label className="field" style={{ marginTop: 10 }}>
                <span>Vale a partir de</span>
                <input
                  className="input"
                  type="date"
                  min={start}
                  value={from}
                  onChange={(e) => {
                    if (e.target.value) setFrom(e.target.value);
                    setFromNote('');
                  }}
                />
              </label>
              {fromNote && <div className="tiny warn-text" style={{ marginTop: 6 }}>{fromNote}</div>}
              <div className="tiny muted" style={{ marginTop: 6 }}>
                Base: “{base.name}”. Os dias antes de {fmtShort(from)} continuam calculados com a versão que valia neles.
                {replaced ? ` Substitui a versão “${replaced.name}”, que começa nesse mesmo dia.` : ''}
                {later.length ? ` Atenção: a versão “${later[0].name}” (${fmtShort(later[0].from)}) continua valendo a partir da data dela.` : ''}
              </div>
            </div>

            {next.notes && (
              <div className="card">
                <div className="label" style={{ marginBottom: 6 }}>
                  Observações do arquivo
                </div>
                <div className="small" style={{ whiteSpace: 'pre-wrap' }}>
                  {next.notes}
                </div>
              </div>
            )}

            <div className="card">
              <div className="card-title">
                <h3>O que muda</h3>
                <span className="tiny muted">cardápio: {fmtInt(check.menuKcal)} kcal</span>
              </div>
              {diff.length === 0 && <div className="small muted">Nada muda em relação à versão atual.</div>}
              {diff.map((sec) => (
                <div key={sec.title} style={{ marginBottom: 10 }}>
                  <div className="label" style={{ marginBottom: 4 }}>
                    {sec.title}
                  </div>
                  {sec.lines.map((l) => (
                    <div key={l} className="small" style={{ padding: '2px 0' }}>
                      {l}
                    </div>
                  ))}
                </div>
              ))}
            </div>

            {errors.map((e) => (
              <div key={e} className="hint bad">
                {e}
              </div>
            ))}
            {orphanWarn && <div className="hint warn">{orphanWarn}</div>}
            {check.warnings.map((w) => (
              <div key={w} className="hint warn">
                {w}
              </div>
            ))}

            <button className="btn primary block" disabled={busy || errors.length > 0 || diff.length === 0} onClick={apply}>
              {errors.length ? 'Corrija os erros para aplicar' : diff.length === 0 ? 'Nada para aplicar' : busy ? 'Aplicando…' : `Aplicar a partir de ${fmtShort(from)}`}
            </button>
            <div className="tiny muted">Dá para desfazer: em Ajustes → Protocolo, apague a versão criada.</div>
          </>
        )}
      </div>
    </Sheet>
  );
}
