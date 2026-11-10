import { env } from './config/env.js';
import { connectDB } from './config/db.js';
import { createApp } from './app.js';
import { startReminderScheduler } from './services/notifier.js';

try {
  await connectDB();
} catch (err) {
  // Don't print the connection string: it contains the database password.
  console.error(`[db] Could not connect to MongoDB: ${err.message}`);
  process.exit(1);
}

const server = createApp().listen(env.port, () => {
  console.log(`[api] listening on http://localhost:${env.port}/api`);
});
startReminderScheduler();

const shutdown = () => server.close(() => process.exit(0));
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
