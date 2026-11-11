import { existsSync } from 'node:fs';
import path from 'node:path';
import { createServer } from 'node:http';
import express from 'express';
import cors from 'cors';
import { initDb } from './db.js';
import { seedDb } from './seed.js';
import { authenticate } from './auth.js';
import { initRealtime } from './realtime.js';
import { authRouter } from './routes/auth.js';
import { publicRouter } from './routes/public.js';
import { tablesRouter } from './routes/tables.js';
import { ordersRouter } from './routes/orders.js';
import { sessionsRouter } from './routes/sessions.js';
import { qrRouter } from './routes/qr.js';
import { reservationsRouter } from './routes/reservations.js';
import { menuAdminRouter } from './routes/menuAdmin.js';
import { miscRouter } from './routes/misc.js';

const PORT = Number(process.env.PORT ?? 4310);

const app = express();
app.disable('x-powered-by');
app.use(cors({ origin: true, credentials: false }));
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'nile-table', time: new Date().toISOString() });
});

app.use('/api/auth', authRouter);
app.use('/api/public', publicRouter);

const staffApi = express.Router();
staffApi.use(authenticate);
staffApi.use(tablesRouter);
staffApi.use(ordersRouter);
staffApi.use(sessionsRouter);
staffApi.use(qrRouter);
staffApi.use(reservationsRouter);
staffApi.use(menuAdminRouter);
staffApi.use(miscRouter);
app.use('/api/restaurant', staffApi);

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'API endpoint not found' });
});

const dist = path.resolve('dist');
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api') && !req.path.startsWith('/socket.io')) {
      res.sendFile(path.join(dist, 'index.html'));
      return;
    }
    next();
  });
}

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[nile] unhandled error:', err);
  res.status(500).json({ error: 'Something went wrong on our side' });
});

async function main() {
  await initDb();
  await seedDb();
  const server = createServer(app);
  initRealtime(server);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(PORT, () => {
      server.off('error', reject);
      resolve();
    });
  });
  console.log(`[nile] API + realtime listening on http://localhost:${PORT}`);
}

main().catch((error) => {
  console.error('[nile] failed to start', error);
  process.exit(1);
});
