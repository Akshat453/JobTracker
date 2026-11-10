import mongoose from 'mongoose';
import { attachDatabasePool } from '@vercel/functions';
import { env } from './env.js';

mongoose.set('strictQuery', true);

let connecting = null;
let poolAttached = false;

/**
 * Connection settings. On Vercel, function instances are frozen between requests, and a TCP socket
 * that sat frozen can be silently dead when the instance wakes up. With the driver defaults
 * (no socket timeout) a query on such a socket hangs until the browser gives up, which shows up as
 * "sometimes a page never loads, refreshing fixes it". So on Vercel:
 * - idle sockets are closed after 10 s instead of being kept for the next (possibly frozen) request,
 * - a stuck query fails after 15 s instead of hanging,
 * - attachDatabasePool() keeps the instance awake just long enough to close idle sockets cleanly.
 */
const options = {
  serverSelectionTimeoutMS: 8000,
  maxPoolSize: env.isVercel ? 5 : 20,
  ...(env.isVercel && {
    minPoolSize: 0,
    maxIdleTimeMS: 10_000,
    socketTimeoutMS: 15_000,
    heartbeatFrequencyMS: 5_000,
  }),
};

/**
 * Connects once and reuses the connection. Serverless functions call this on every request, so a
 * warm instance skips straight through.
 */
export async function connectDB(uri = env.mongoUri) {
  if (mongoose.connection.readyState === 1) return mongoose.connection;
  connecting ??= mongoose
    .connect(uri, options)
    .then(() => {
      if (env.isVercel && !poolAttached) {
        poolAttached = true;
        attachDatabasePool(mongoose.connection.getClient());
      }
      if (!env.isTest) console.log(`[db] connected to ${mongoose.connection.name}`);
      return mongoose.connection;
    })
    .finally(() => { connecting = null; });
  return connecting;
}

export async function disconnectDB() {
  await mongoose.disconnect();
}
