import 'dotenv/config';

const isTest = process.env.NODE_ENV === 'test';
// Running as a Vercel serverless function (production or preview deployment).
const isVercel = Boolean(process.env.VERCEL) && !isTest;
const isProd = process.env.NODE_ENV === 'production' || isVercel;
// On Vercel the site and API share one origin; default CLIENT_URL to the production domain.
const vercelUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : '';

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isTest,
  isProd,
  isVercel,
  port: Number(process.env.PORT) || 5001,
  clientUrl: process.env.CLIENT_URL || vercelUrl || 'http://localhost:5173',
  mongoUri: isTest
    ? process.env.MONGODB_URI_TEST || 'mongodb://127.0.0.1:27017/jobtracker_test'
    : process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/jobtracker',
  jwtSecret: process.env.JWT_SECRET || (isTest ? 'test-secret' : ''),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  // When set, new accounts need this invite code. Leave empty to allow open sign-up.
  registrationCode: isTest ? process.env.REGISTRATION_CODE_TEST || '' : process.env.REGISTRATION_CODE || '',
  // Number of reverse proxies in front of the app (Vercel: 1). Needed for correct client IPs in rate limiting.
  trustProxy: Number(process.env.TRUST_PROXY ?? (isProd ? 1 : 0)),
  // Vercel functions accept request bodies up to 4.5 MB, so uploads are capped at 4 MB there.
  maxUploadMb: Math.min(Number(process.env.MAX_UPLOAD_MB) || (isVercel ? 4 : 10), isVercel ? 4 : 50),
  // Shared secret Vercel Cron sends as a Bearer token to the scheduled reminder job.
  cronSecret: process.env.CRON_SECRET || '',
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.MAIL_FROM || 'Job Tracker <no-reply@jobtracker.local>',
  },
  reminderIntervalMin: Number(process.env.REMINDER_CHECK_INTERVAL_MIN ?? 60),
};

if (!env.jwtSecret) {
  throw new Error('JWT_SECRET is not set. Copy server/.env.example to server/.env and fill it in.');
}

// Refuse to start in production with unsafe or missing settings.
if (isProd) {
  const problems = [];
  if (!process.env.MONGODB_URI) problems.push('MONGODB_URI is not set');
  if (!process.env.CLIENT_URL && !vercelUrl) problems.push('CLIENT_URL is not set (your frontend URL, e.g. https://your-app.vercel.app)');
  if (env.jwtSecret.length < 32 || /change-me/i.test(env.jwtSecret)) problems.push('JWT_SECRET must be a random string of at least 32 characters');
  if (env.clientUrl.split(',').some((u) => !/^https:\/\//.test(u.trim()))) problems.push('CLIENT_URL must use https:// in production');
  if (problems.length) throw new Error(`Unsafe production configuration:\n  - ${problems.join('\n  - ')}`);
}
