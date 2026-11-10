import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env.js';
import routes from './routes/index.js';
import { notFound, errorHandler } from './middleware/error.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  // Behind Vercel's proxy, so rate limits see the real client IP.
  app.set('trust proxy', env.trustProxy);
  // Flat query strings only: blocks `?field[$ne]=x` style operator injection into MongoDB filters.
  app.set('query parser', 'simple');
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'same-site' } }));
  app.use(cors({
    origin: env.clientUrl.split(',').map((u) => u.trim().replace(/\/$/, '')),
    exposedHeaders: ['Content-Disposition'],
    maxAge: 600,
  }));
  app.use(express.json({ limit: '1mb' }));
  // API responses are private and per-user: never let a browser or CDN cache them.
  app.use('/api', (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  if (!env.isTest) app.use(morgan(env.isProd ? 'combined' : 'dev'));

  app.use('/api', routes);
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
