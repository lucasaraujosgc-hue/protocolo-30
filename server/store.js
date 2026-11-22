import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

const KEEP_BACKUPS = 30;

export function emptyState() {
  return {
    version: 2,
    profile: null,
    settings: null,
    protocols: [],
    days: {},
    measurements: [],
    compensation: null,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Armazenamento em um único arquivo JSON (uso pessoal, um usuário).
 * Escrita atômica (arquivo temporário + rename), fila de gravação e backup diário.
 */
export class Store {
  constructor(dir) {
    this.dir = dir;
    this.file = path.join(dir, 'db.json');
    this.backupDir = path.join(dir, 'backups');
    this.queue = Promise.resolve();
    this.state = null;
  }

  async init() {
    await fsp.mkdir(this.backupDir, { recursive: true });
    try {
      const raw = await fsp.readFile(this.file, 'utf8');
      this.state = { ...emptyState(), ...JSON.parse(raw) };
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
      this.state = emptyState();
      await this.persist();
    }
  }

  get() {
    return this.state;
  }

  /** Aplica `mutator` numa cópia; se não lançar erro, grava e publica o novo estado. */
  update(mutator) {
    const run = async () => {
      const draft = structuredClone(this.state);
      mutator(draft);
      draft.updatedAt = new Date().toISOString();
      this.state = draft;
      await this.persist();
      return this.state;
    };
    const p = this.queue.then(run, run);
    this.queue = p.catch(() => {});
    return p;
  }

  async persist() {
    const tmp = `${this.file}.tmp`;
    await fsp.writeFile(tmp, JSON.stringify(this.state));
    await fsp.rename(tmp, this.file);
    await this.dailyBackup();
  }

  async dailyBackup() {
    const day = new Date().toISOString().slice(0, 10);
    const target = path.join(this.backupDir, `db-${day}.json`);
    if (fs.existsSync(target)) return;
    await fsp.copyFile(this.file, target);
    const files = (await fsp.readdir(this.backupDir)).filter((f) => /^db-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
    for (const f of files.slice(0, Math.max(0, files.length - KEEP_BACKUPS))) {
      await fsp.unlink(path.join(this.backupDir, f));
    }
  }

  /** Cópia extra antes de importar um backup por cima dos dados atuais. */
  async snapshot(label) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    await fsp.writeFile(path.join(this.backupDir, `pre-${label}-${stamp}.json`), JSON.stringify(this.state));
  }
}
