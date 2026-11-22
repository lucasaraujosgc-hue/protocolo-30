import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  COOKIE,
  LoginLimiter,
  SESSION_DAYS,
  loadSecret,
  parseCookies,
  passwordFingerprint,
  passwordMatches,
  signSession,
  verifySession,
} from './auth.js';
import {
  ValidationError,
  isDate,
  sanitizeCompensation,
  sanitizeDay,
  sanitizeMeasurement,
  sanitizeProfile,
  sanitizeSettings,
  sanitizeState,
} from './sanitize.js';
import { Store } from './store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data'));
const PORT = Number(process.env.PORT || 3000);
const PASSWORD = process.env.APP_PASSWORD || '';

if (PASSWORD.length < 6) {
  console.error('[protocolo-30] Defina a variável APP_PASSWORD (mínimo de 6 caracteres) antes de iniciar.');
  process.exit(1);
}

fs.mkdirSync(DATA_DIR, { recursive: true });
try {
  fs.accessSync(DATA_DIR, fs.constants.W_OK);
} catch {
  console.error(`[protocolo-30] Sem permissão de escrita em ${DATA_DIR}. Confira o volume montado.`);
  process.exit(1);
}

const store = new Store(DATA_DIR);
await store.init();
const SECRET = loadSecret(DATA_DIR);
const PW_FP = passwordFingerprint(SECRET, PASSWORD);
const limiter = new LoginLimiter();

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; worker-src 'self'; manifest-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'",
  );
  next();
});

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use('/api', express.json({ limit: '15mb' }));

// Mutações só com JSON: junto do cookie SameSite=Strict, bloqueia envios de outros sites.
app.use('/api', (req, res, next) => {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && !req.is('application/json')) {
    return res.status(415).json({ error: 'Envie os dados em JSON.' });
  }
  next();
});

const isSecure = (req) => req.secure || req.headers['x-forwarded-proto'] === 'https';

function setSession(req, res) {
  const token = signSession(SECRET, { exp: Date.now() + SESSION_DAYS * 86400000, pw: PW_FP });
  const parts = [`${COOKIE}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Strict', `Max-Age=${SESSION_DAYS * 86400}`];
  if (isSecure(req)) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

function isAuthed(req) {
  const payload = verifySession(SECRET, parseCookies(req.headers.cookie)[COOKIE]);
  return !!payload && payload.pw === PW_FP;
}

app.post('/api/login', (req, res) => {
  const ip = req.ip || 'desconhecido';
  if (!limiter.check(ip)) return res.status(429).json({ error: 'Muitas tentativas. Aguarde 15 minutos.' });
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!passwordMatches(password, PASSWORD)) {
    limiter.fail(ip);
    return res.status(401).json({ error: 'Senha incorreta.' });
  }
  limiter.reset(ip);
  setSession(req, res);
  res.json({ ok: true });
});

app.post('/api/logout', (req, res) => {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`);
  res.json({ ok: true });
});

app.use('/api', (req, res, next) => {
  if (!isAuthed(req)) return res.status(401).json({ error: 'Faça login.' });
  next();
});

app.get('/api/state', (req, res) => res.json(store.get()));

app.put('/api/profile', async (req, res) => {
  const profile = sanitizeProfile(req.body);
  res.json(await store.update((s) => void (s.profile = profile)));
});

app.put('/api/settings', async (req, res) => {
  const settings = sanitizeSettings(req.body);
  res.json(await store.update((s) => void (s.settings = settings)));
});

app.put('/api/day/:date', async (req, res) => {
  const { date } = req.params;
  if (!isDate(date)) throw new ValidationError('data inválida');
  const day = sanitizeDay(req.body);
  const empty =
    !Object.keys(day.meals).length && !day.extras.length && !day.exercises.length && day.steps === undefined && !day.absorbed;
  res.json(
    await store.update((s) => {
      if (empty) delete s.days[date];
      else s.days[date] = day;
    }),
  );
});

app.put('/api/measurements/:id', async (req, res) => {
  const { id } = req.params;
  if (!/^[\w-]{1,40}$/.test(id)) throw new ValidationError('id inválido');
  const m = sanitizeMeasurement(req.body, id);
  res.json(
    await store.update((s) => {
      const i = s.measurements.findIndex((x) => x.id === id);
      if (i >= 0) s.measurements[i] = m;
      else s.measurements.push(m);
    }),
  );
});

app.delete('/api/measurements/:id', async (req, res) => {
  const { id } = req.params;
  res.json(await store.update((s) => void (s.measurements = s.measurements.filter((x) => x.id !== id))));
});

app.put('/api/compensation', async (req, res) => {
  const comp = sanitizeCompensation(req.body?.compensation ?? null);
  res.json(await store.update((s) => void (s.compensation = comp)));
});

app.get('/api/export', (req, res) => {
  const day = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Disposition', `attachment; filename="protocolo-30-backup-${day}.json"`);
  res.json(store.get());
});

app.post('/api/import', async (req, res) => {
  const next = sanitizeState(req.body);
  await store.snapshot('import');
  res.json(await store.update((s) => void Object.assign(s, next)));
});

app.use('/api', (req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));

app.use('/assets', express.static(path.join(DIST, 'assets'), { immutable: true, maxAge: '1y', index: false }));
app.use(
  express.static(DIST, {
    index: false,
    setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache'),
  }),
);
app.get('/{*splat}', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(DIST, 'index.html'));
});

app.use((err, req, res, _next) => {
  if (err instanceof ValidationError) return res.status(400).json({ error: err.message });
  if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON inválido.' });
  if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'Arquivo grande demais.' });
  console.error(err);
  res.status(500).json({ error: 'Erro interno.' });
});

app.listen(PORT, () => {
  console.log(`[protocolo-30] no ar na porta ${PORT} · dados em ${DATA_DIR}`);
});
