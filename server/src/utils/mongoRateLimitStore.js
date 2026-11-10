import mongoose from 'mongoose';

/**
 * express-rate-limit store backed by MongoDB, so limits hold across serverless instances
 * (in-memory counters would reset on every cold start and differ per instance).
 * Documents expire automatically through a TTL index.
 */
export class MongoRateLimitStore {
  constructor({ prefix }) {
    this.prefix = prefix;
    this.localKeys = false;
  }

  init({ windowMs }) {
    this.windowMs = windowMs;
  }

  get col() {
    const col = mongoose.connection.db.collection('ratelimits');
    if (!MongoRateLimitStore.indexed) {
      MongoRateLimitStore.indexed = col.createIndex({ resetAt: 1 }, { expireAfterSeconds: 0 }).catch(() => { MongoRateLimitStore.indexed = null; });
    }
    return col;
  }

  id(key) { return `${this.prefix}:${key}`; }

  async increment(key) {
    const now = new Date();
    const expired = { $or: [{ $eq: [{ $type: '$resetAt' }, 'missing'] }, { $lte: ['$resetAt', now] }] };
    const doc = await this.col.findOneAndUpdate(
      { _id: this.id(key) },
      [{ $set: {
        hits: { $cond: [expired, 1, { $add: ['$hits', 1] }] },
        resetAt: { $cond: [expired, new Date(now.getTime() + this.windowMs), '$resetAt'] },
      } }],
      { upsert: true, returnDocument: 'after' },
    );
    return { totalHits: doc.hits, resetTime: doc.resetAt };
  }

  async decrement(key) {
    await this.col.updateOne({ _id: this.id(key), hits: { $gt: 0 } }, { $inc: { hits: -1 } });
  }

  async resetKey(key) {
    await this.col.deleteOne({ _id: this.id(key) });
  }
}
