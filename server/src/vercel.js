/**
 * Vercel entry point for the "server" service (see /vercel.json). Vercel routes every /api/* request
 * here with its original path, so the same Express app and routes run as in local development.
 * The database connection is opened on the first request and reused while the instance stays warm.
 * Local development uses src/index.js instead, which runs a normal long-lived server.
 */
import express from 'express'; // eslint-disable-line no-unused-vars -- Vercel's Express detection looks for this import
import { createApp } from './app.js';
import { waitUntil } from '@vercel/functions';
import { connectDB } from './config/db.js';
import { maybeRunReminderNotifications } from './services/notifier.js';

async function ensureDatabase(_req, res, next) {
  try {
    await connectDB();
    // Piggy-back the reminder email check on normal traffic (throttled to once per 10 minutes
    // overall). waitUntil lets it finish after the response is sent, so no request gets slower.
    waitUntil(maybeRunReminderNotifications().catch((e) => console.error('[notifier]', e.message)));
    next();
  } catch (err) {
    console.error('[db] connection failed:', err.message);
    res.status(503).set('Cache-Control', 'no-store').json({ error: { message: 'Database unavailable. Please try again in a moment.' } });
  }
}

const app = createApp({ beforeRoutes: [ensureDatabase] });

export default app;
