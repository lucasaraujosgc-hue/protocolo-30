/** Compartilhar/baixar/copiar arquivos gerados no próprio aparelho (funciona no PWA do iPhone). */

type ShareNav = Navigator & { canShare?: (d: ShareData) => boolean };

export type ShareOutcome = 'shared' | 'downloaded' | 'cancelled';

/** Abre a planilha de compartilhamento do sistema com o arquivo; sem suporte, baixa o arquivo. Chame direto no toque do botão. */
export async function shareFile(fileName: string, text: string, opts: { title?: string; text?: string } = {}): Promise<ShareOutcome> {
  const nav = navigator as ShareNav;
  if (typeof nav.share === 'function' && typeof File === 'function') {
    // Alguns navegadores não aceitam application/json: tenta também como texto (.txt).
    const candidates = [
      new File([text], fileName, { type: 'application/json' }),
      new File([text], fileName.replace(/\.json$/, '.txt'), { type: 'text/plain' }),
    ];
    for (const file of candidates) {
      const data: ShareData = { files: [file], title: opts.title ?? fileName };
      if (opts.text) data.text = opts.text;
      if (nav.canShare && !nav.canShare(data)) continue;
      try {
        await nav.share(data);
        return 'shared';
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled';
        break;
      }
    }
  }
  downloadText(fileName, text);
  return 'downloaded';
}

export function downloadText(fileName: string, text: string, mime = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* tenta o método antigo */
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.top = '0';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  ta.setSelectionRange(0, text.length);
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  ta.remove();
  return ok;
}

export const fmtBytes = (n: number) => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} MB`);
