import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import { resolve, dirname } from 'path';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { authRouter } from './routes/auth.routes';
import { profileRouter } from './routes/profile.routes';
import { fortuneRouter } from './routes/fortune.routes';
import { chatRouter } from './routes/chat.routes';
import { attachChatWs } from './ws/chat-ws';
import { adminRouter } from './routes/admin.routes';
import { chartRouter } from './routes/chart.routes';
import { astroInterpretRouter } from './routes/astro-interpret.routes';
import { tarotRouter } from './routes/tarot.routes';
import { acgRouter } from './routes/acg.routes';
import { errorHandler } from './middleware/error-handler';
import { rateLimiter } from './middleware/rate-limiter';
import { initAdmin } from './services/auth.service';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);
const IS_PROD = process.env.NODE_ENV === 'production';

// Refuse to run in production with missing, placeholder or short JWT secrets
if (IS_PROD) {
  const a = process.env.JWT_ACCESS_SECRET || '';
  const r = process.env.JWT_REFRESH_SECRET || '';
  const weak = (v: string) => v.length < 16 || /change-?me/i.test(v);
  if (weak(a) || weak(r) || a === r) {
    throw new Error('生产环境需要两个不同的强随机 JWT_ACCESS_SECRET / JWT_REFRESH_SECRET（至少 16 字符，建议 48 以上）');
  }
}

// Trust first proxy (nginx / cloudflare) so req.ip is correct
if (IS_PROD) app.set('trust proxy', 1);

app.use(helmet());

// gzip JSON/static responses (e.g. ACG line data ~100KB). Never compress SSE:
// the middleware would buffer the stream and break token-by-token delivery.
app.use(compression({
  filter: (req, res) => {
    const type = String(res.getHeader('Content-Type') || '');
    if (type.includes('text/event-stream')) return false;
    return compression.filter(req, res);
  },
}));

// CORS: restrict origin in production
const CORS_ORIGIN = process.env.CORS_ORIGIN; // e.g. 'https://yourdomain.com'
app.use(cors({
  origin: IS_PROD ? (CORS_ORIGIN || false) : (CORS_ORIGIN || true),
  credentials: true,
  exposedHeaders: ['X-Session-Id'],
}));

// Only rate-limit the API; counting static assets (dozens of lazy chunks per page load) tripped the limit on refresh
app.use('/api', rateLimiter);
// Small bodies everywhere; chat (image uploads) parses its own large bodies *after* authentication,
// so anonymous clients can't make the server buffer tens of megabytes
const jsonSmall = express.json({ limit: '1mb' });
app.use((req, res, next) => (req.path.startsWith('/api/v1/chat') ? next() : jsonSmall(req, res, next)));
app.use(cookieParser());

// API routes
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/profiles', profileRouter);
app.use('/api/v1/fortunes', fortuneRouter);
app.use('/api/v1/chat', chatRouter);
app.use('/api/v1/admin', adminRouter);
app.use('/api/v1/charts', chartRouter);
app.use('/api/v1/astro-interpret', astroInterpretRouter);
app.use('/api/v1/tarot', tarotRouter);
app.use('/api/v1/acg', acgRouter);

// Serve static frontend in production
// When running via tsx, __dirname = <project>/server, so dist/client = ../dist/client
const clientDist = resolve(__dirname, '../dist/client');
if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('/{*path}', (_req, res) => {
    res.sendFile(resolve(clientDist, 'index.html'));
  });
}

app.use(errorHandler);

async function bootstrap() {
  await initAdmin();
  const server = app.listen(PORT, () => {
    console.log(`天枢 (Arcanum) server running on http://localhost:${PORT}`);
  });
  // Chat runs over WebSocket (/api/v1/chat/ws); behind nginx, proxy Upgrade/Connection headers too
  attachChatWs(server);
}

bootstrap().catch(console.error);

export default app;
