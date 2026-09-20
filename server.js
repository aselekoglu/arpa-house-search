import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bodyParser from 'body-parser';
import restana from 'restana';
import files from 'serve-static';
import { createNeonSqlClient } from './lib/production/neonSql.js';
import { ensureProductionSchema } from './lib/production/schema.js';
import { createProductionStore } from './lib/production/store.js';
import { createProductionRuntime } from './lib/production/runtime.js';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('DATABASE_URL is required for the production server');

const client = createNeonSqlClient({ connectionString: DATABASE_URL });
await ensureProductionSchema(client);
const store = createProductionStore(client);
const runtime = createProductionRuntime({ store });

const service = restana();
const dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number.parseInt(process.env.PORT ?? '3000', 10);
const SESSION_COOKIE = 'arpa_session';
const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
const sessionSecret = crypto
  .createHash('sha256')
  .update(process.env.ARPA_SESSION_SECRET || `arpa-session:${DATABASE_URL}`)
  .digest();

const parseCookies = (header = '') =>
  Object.fromEntries(
    String(header)
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf('=');
        return index === -1
          ? [decodeURIComponent(part), '']
          : [decodeURIComponent(part.slice(0, index)), decodeURIComponent(part.slice(index + 1))];
      }),
  );

const signSession = (userId) => {
  const payload = Buffer.from(userId, 'utf8').toString('base64url');
  const signature = crypto.createHmac('sha256', sessionSecret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
};

const verifySession = (value) => {
  if (typeof value !== 'string') return null;
  const [payload, signature] = value.split('.');
  if (!payload || !signature) return null;
  const expected = crypto.createHmac('sha256', sessionSecret).update(payload).digest();
  let actual;
  try {
    actual = Buffer.from(signature, 'base64url');
  } catch {
    return null;
  }
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;
  try {
    return Buffer.from(payload, 'base64url').toString('utf8');
  } catch {
    return null;
  }
};

const sessionUserId = (req) => {
  const cookies = parseCookies(req.headers?.cookie);
  return verifySession(cookies[SESSION_COOKIE]);
};

const setSession = (res, userId) => {
  const secure = process.env.VERCEL === '1' || process.env.NODE_ENV === 'production';
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(signSession(userId))}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${SESSION_MAX_AGE_SECONDS}`,
  ];
  if (secure) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
};

const clearSession = (res) => {
  const secure = process.env.VERCEL === '1' || process.env.NODE_ENV === 'production';
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`,
  );
};

const sendError = (res, error, fallback = 'Request failed') => {
  const message =
    error instanceof TypeError
      ? error.message
      : error?.message === 'Custom Source not found' || error?.message === 'Search Profile not found'
        ? error.message
        : fallback;
  const status =
    error instanceof TypeError
      ? 400
      : message.endsWith('not found')
        ? 404
        : /already has a run in progress/i.test(error?.message ?? '')
          ? 409
          : 500;
  res.send(
    {
      error: error?.name ?? 'Error',
      message,
    },
    status,
  );
};

const auth = async (req, res, next) => {
  const userId = sessionUserId(req);
  if (!userId || !(await runtime.currentUser(userId))) {
    clearSession(res);
    res.send({ error: 'Unauthorized', message: 'Login required' }, 401);
    return;
  }
  req.arpaUserId = userId;
  next();
};

const handle = (handler, fallback) => async (req, res) => {
  try {
    const data = await handler(req);
    res.send(data);
  } catch (error) {
    sendError(res, error, fallback);
  }
};

service.use(bodyParser.json({ limit: '1mb' }));

service.get('/api/health', (_req, res) =>
  res.send({ ok: true, service: 'arpa-house-search', persistence: 'neon' }),
);
service.get('/api/demo', (_req, res) => res.send({ demoMode: false }));

service.get('/api/login/user', async (req, res) => {
  const user = await runtime.currentUser(sessionUserId(req));
  res.send(user ?? {});
});

service.post('/api/login', async (req, res) => {
  const user = await runtime.authenticate(req.body?.username, req.body?.password);
  if (!user) {
    res.send({ error: 'Unauthorized', message: 'Invalid username or password' }, 401);
    return;
  }
  setSession(res, user.userId);
  res.send({ ok: true });
});

service.post('/api/login/logout', (_req, res) => {
  clearSession(res);
  res.send({ ok: true });
});

service.use('/api/sources', auth);
service.get('/api/sources', handle((req) => runtime.listSources(req.arpaUserId), 'Could not load sources'));
service.post(
  '/api/sources',
  handle((req) => runtime.saveSource(req.arpaUserId, req.body), 'Could not save source'),
);
service.post(
  '/api/sources/:sourceId/test',
  handle((req) => runtime.testSource(req.arpaUserId, req.params.sourceId), 'Test Extraction failed'),
);
service.put(
  '/api/sources/:sourceId/status',
  handle(
    (req) => runtime.setSourceEnabled(req.arpaUserId, req.params.sourceId, req.body?.enabled),
    'Could not update source',
  ),
);
service.delete(
  '/api/sources/:sourceId',
  handle((req) => runtime.deleteSource(req.arpaUserId, req.params.sourceId), 'Could not delete source'),
);

service.use('/api/searchProfiles', auth);
service.get(
  '/api/searchProfiles',
  handle((req) => runtime.listProfiles(req.arpaUserId), 'Could not load Search Profiles'),
);
service.post(
  '/api/searchProfiles',
  handle((req) => runtime.saveProfile(req.arpaUserId, req.body), 'Could not save Search Profile'),
);
service.get(
  '/api/searchProfiles/:profileId/execution-context',
  handle(
    (req) => runtime.getExecutionContext(req.arpaUserId, req.params.profileId),
    'Could not load execution context',
  ),
);
service.post(
  '/api/searchProfiles/:profileId/run',
  handle(
    (req) =>
      runtime.executeProfile({
        userId: req.arpaUserId,
        profileId: req.params.profileId,
        trigger: 'manual',
      }),
    'Search Profile run failed',
  ),
);
service.delete(
  '/api/searchProfiles/:profileId',
  handle(
    (req) => runtime.deleteProfile(req.arpaUserId, req.params.profileId),
    'Could not delete Search Profile',
  ),
);

service.use('/api/listing-feed', auth);
service.get(
  '/api/listing-feed',
  handle(
    (req) =>
      runtime.queryFeed({
        userId: req.arpaUserId,
        profileId: req.query?.profileId,
        sort: req.query?.sort ?? 'newest',
      }),
    'Could not load Listing Feed',
  ),
);

service.get('/api/cron/search-profiles', async (req, res) => {
  const secret = process.env.CRON_SECRET;
  const authorization = req.headers?.authorization;
  const userAgent = String(req.headers?.['user-agent'] ?? '');
  const authorized =
    secret
      ? authorization === `Bearer ${secret}`
      : userAgent.toLowerCase().includes('vercel-cron');
  if (!authorized) {
    res.send({ error: 'Unauthorized', message: 'Cron authentication failed' }, 401);
    return;
  }
  try {
    res.send(await runtime.schedulerTick());
  } catch (error) {
    sendError(res, error, 'Scheduler tick failed');
  }
});

service.use(files(path.join(dirname, 'ui', 'public'), { index: ['index.html'] }));

service.start(PORT).then(() => {
  console.info(`ARPA House Search production server listening on port ${PORT}`);
});
