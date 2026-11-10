import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';

const digest = (s) => crypto.createHash('sha256').update(String(s)).digest();

/** Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`. Without a configured secret the job is disabled. */
export function requireCronSecret(req, _res, next) {
  const header = req.headers.authorization || '';
  if (!env.cronSecret || !crypto.timingSafeEqual(digest(header), digest(`Bearer ${env.cronSecret}`))) {
    return next(ApiError.notFound('Route not found'));
  }
  next();
}
