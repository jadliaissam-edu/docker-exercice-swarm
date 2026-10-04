import express from 'express';
import os from 'node:os';
import fs from 'node:fs';
import pg from 'pg';
import { createClient } from 'redis';

const PORT = process.env.PORT || 3000;

// Read a value from VAR or from the file pointed by VAR_FILE (Docker secrets)
function env(name, fallback) {
  const file = process.env[`${name}_FILE`];
  if (file) return fs.readFileSync(file, 'utf8').trim();
  return process.env[name] ?? fallback;
}

// --- PostgreSQL ---
const pool = new pg.Pool({
  host: env('DB_HOST', 'localhost'),
  port: Number(env('DB_PORT', 5432)),
  user: env('DB_USER', 'app'),
  password: env('DB_PASSWORD', 'app'),
  database: env('DB_NAME', 'app'),
  connectionTimeoutMillis: 2000,
});
pool.on('error', (err) => console.error('[db] idle client error:', err.message));

// --- Redis ---
const redis = createClient({
  url: env('REDIS_URL', 'redis://localhost:6379'),
  disableOfflineQueue: true, // fail fast instead of hanging when Redis is down
  socket: { connectTimeout: 2000, reconnectStrategy: (retries) => Math.min(retries * 500, 5000) },
});
redis.on('error', (err) => console.error('[redis]', err.message));
redis.connect().catch(() => {});

const app = express();

// Liveness probe: only says "the Node process is alive"
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

// Full status: backend + dependencies
app.get('/api/status', async (_req, res) => {
  const status = {
    app: 'app1-postgres',
    backend: 'up',
    hostname: os.hostname(), // container id -> shows which replica answered
    db: 'down',
    redis: 'down',
    visits: null,
  };

  try {
    await pool.query('SELECT 1');
    status.db = 'up';
  } catch (err) {
    status.dbError = err.message;
  }

  try {
    status.visits = await redis.incr('visits');
    status.redis = 'up';
  } catch (err) {
    status.redisError = err.message;
  }

  res.json(status);
});

const server = app.listen(PORT, () => console.log(`Backend listening on :${PORT}`));

// Graceful shutdown (docker sends SIGTERM on service update / scale down)
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down');
  server.close(async () => {
    await Promise.allSettled([pool.end(), redis.quit()]);
    process.exit(0);
  });
});
