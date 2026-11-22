import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const COOKIE = 'p30_session';
export const SESSION_DAYS = 30;

/** Segredo das sessões: variável SESSION_SECRET ou um arquivo gerado no volume de dados. */
export function loadSecret(dataDir) {
  const env = process.env.SESSION_SECRET;
  if (env && env.length >= 16) return env;
  const file = path.join(dataDir, '.session-secret');
  try {
    const s = fs.readFileSync(file, 'utf8').trim();
    if (s.length >= 32) return s;
  } catch {
    /* gera abaixo */
  }
  const secret = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(file, secret, { mode: 0o600 });
  return secret;
}

const hmac = (secret, data) => crypto.createHmac('sha256', secret).update(data).digest('base64url');

/** Impressão digital da senha: trocar APP_PASSWORD derruba as sessões antigas. */
export function passwordFingerprint(secret, password) {
  return hmac(secret, `pw:${password}`).slice(0, 16);
}

export function signSession(secret, payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${hmac(secret, body)}`;
}

export function verifySession(secret, token) {
  if (typeof token !== 'string') return null;
  const [body, mac] = token.split('.');
  if (!body || !mac) return null;
  const a = Buffer.from(mac);
  const b = Buffer.from(hmac(secret, body));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (typeof payload.exp !== 'number' || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function passwordMatches(input, expected) {
  const h = (s) => crypto.createHash('sha256').update(String(s)).digest();
  return crypto.timingSafeEqual(h(input), h(expected));
}

export function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    try {
      out[k] = decodeURIComponent(v);
    } catch {
      out[k] = v;
    }
  }
  return out;
}

/** Limite simples de tentativas de login por IP. */
export class LoginLimiter {
  constructor(max = 10, windowMs = 15 * 60 * 1000) {
    this.max = max;
    this.windowMs = windowMs;
    this.hits = new Map();
  }

  check(ip) {
    const now = Date.now();
    const h = this.hits.get(ip);
    if (!h || h.reset < now) return true;
    return h.count < this.max;
  }

  fail(ip) {
    const now = Date.now();
    const h = this.hits.get(ip);
    if (!h || h.reset < now) this.hits.set(ip, { count: 1, reset: now + this.windowMs });
    else h.count += 1;
    if (this.hits.size > 5000) this.hits.clear();
  }

  reset(ip) {
    this.hits.delete(ip);
  }
}
