import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { fileURLToPath } from 'node:url';
import { createServer as createHttpServer } from 'node:http';
import { query } from './database.js';
import * as directory from './directory.js';
import { parseDiscoveryQuery } from './discovery-query.js';
import { accounts } from './accounts.js';

const app = express();
app.disable('x-powered-by');
if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '20kb' }));
app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
app.use('/api', rateLimit({ windowMs: 60_000, limit: 100, standardHeaders: 'draft-7', legacyHeaders: false }));
app.use('/api', (req, res, next) => /^\/(auth|account|moderation)(\/|$)/.test(req.path) ? accounts(req, res, next) : next());

app.get('/api/health', async (req, res) => {
  try {
    await query('SELECT 1 AS ok');
    res.json({ ok: true, database: 'connected' });
  } catch {
    res.status(503).json({ ok: false, database: 'unavailable' });
  }
});

const endpoint = (message, handler) => async (req, res) => {
  try { await handler(req, res); }
  catch (error) {
    console.error(message, error.message);
    res.status(500).json({ error: message });
  }
};

app.get('/api/locations', endpoint('Unable to load locations', async (req, res) => {
  res.json(await directory.locations());
}));

function discoveryOptions(req, res) {
  try { return parseDiscoveryQuery(req.query); }
  catch (error) { res.status(400).json({ error: error.message }); return null; }
}
app.get('/api/agents', endpoint('Unable to load agents', async (req, res) => {
  const options = discoveryOptions(req, res);
  if (!options) return;
  res.json(req.query.page !== undefined || req.query.page_size !== undefined
    ? await directory.searchAgents(options) : await directory.agents(options));
}));

app.get('/api/agents/:id/reviews', endpoint('Unable to load reviews', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: 'Invalid agent ID' });
  res.json(await directory.reviews(id));
}));

app.get('/api/ads', endpoint('Unable to load ads', async (req, res) => {
  const options = discoveryOptions(req, res);
  if (options) res.json(await directory.advertisements(options));
}));

const httpServer = createHttpServer(app);
let vite;
if (process.argv.includes('--dev')) {
  const { createServer } = await import('vite');
  vite = await createServer({
    server: { middlewareMode: true, hmr: { server: httpServer } }, appType: 'spa'
  });
  app.use(vite.middlewares);
} else {
  app.use(express.static(fileURLToPath(new URL('./dist', import.meta.url)), {
    setHeaders: (res, path) => {
      if (path.endsWith('sw.js') || path.endsWith('index.html') || path.endsWith('manifest.webmanifest')) res.set('Cache-Control', 'no-cache');
    }
  }));
}
const port = Number(process.env.PORT || 3000);
httpServer.on('error', async error => {
  console.error(error.code === 'EADDRINUSE'
    ? `Port ${port} is already in use. Stop the other server or set PORT in .env.`
    : `Unable to start server: ${error.message}`);
  await vite?.close();
  process.exitCode = 1;
});
httpServer.listen(port, () => console.log(`Agent directory listening at http://localhost:${port}`));
