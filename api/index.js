/**
 * Vercel serverless entry point: every /api/* request is rewritten here (see vercel.json) and
 * handled by the same Express app used in local development. The database connection is created
 * on the first request and reused while the function instance stays warm.
 */
import { createApp } from '../server/src/app.js';
import { connectDB } from '../server/src/config/db.js';

const app = createApp();

export default async function handler(req, res) {
  try {
    await connectDB();
  } catch (err) {
    console.error('[db] connection failed:', err.message);
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    return res.end(JSON.stringify({ error: { message: 'Database unavailable. Please try again in a moment.' } }));
  }
  return app(req, res);
}
