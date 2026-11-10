import mongoose from 'mongoose';
import { env } from './env.js';

mongoose.set('strictQuery', true);

let connecting = null;

/**
 * Connects once and reuses the connection. Serverless functions call this on every request, so a
 * warm instance skips straight through. A small pool keeps total connections well under Atlas limits.
 */
export async function connectDB(uri = env.mongoUri) {
  if (mongoose.connection.readyState === 1) return mongoose.connection;
  connecting ??= mongoose
    .connect(uri, { serverSelectionTimeoutMS: 8000, maxPoolSize: env.isVercel ? 5 : 20 })
    .then(() => {
      if (!env.isTest) console.log(`[db] connected to ${mongoose.connection.name}`);
      return mongoose.connection;
    })
    .finally(() => { connecting = null; });
  return connecting;
}

export async function disconnectDB() {
  await mongoose.disconnect();
}
