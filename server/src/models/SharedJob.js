import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;

export const SHARE_TTL_DAYS = 30;
/** How long the sharer's "Sent" history keeps a share after it was created. */
export const SHARE_HISTORY_DAYS = 365;
const DAY_MS = 86_400_000;

/**
 * A job one user shares with friends through a link. Only a copy of four public fields is stored
 * (company name, company website, job title, posting URL), so nothing else from the sharer's
 * application (status, notes, resume, email, dates) can ever leak through a link.
 * The link stops working after SHARE_TTL_DAYS (`expiresAt`). The record itself stays for
 * SHARE_HISTORY_DAYS so the sharer can see what they shared; MongoDB removes it then (TTL on `purgeAt`).
 */
const sharedJobSchema = new mongoose.Schema(
  {
    // 32 random bytes, base64url. Only its SHA-256 hash is stored, so a database leak doesn't
    // reveal working links.
    tokenHash: { type: String, required: true, unique: true },
    owner: { type: ObjectId, ref: 'User', required: true, index: true },
    application: { type: ObjectId, ref: 'Application' },
    // Set when sent to a specific friend (from "Send to friends"): only they can open or add it, and
    // it appears in their "Shared with me" list. Unset for open links made with "Share".
    recipient: { type: ObjectId, ref: 'User', index: true },
    message: { type: String, trim: true, maxlength: 500 },
    job: {
      companyName: { type: String, required: true, trim: true, maxlength: 120 },
      companyWebsite: { type: String, trim: true },
      jobTitle: { type: String, required: true, trim: true, maxlength: 160 },
      jobPostingUrl: { type: String, trim: true },
    },
    // What each recipient did, so the page shows "Added" / "Declined" when they open it again.
    responses: [
      {
        _id: false,
        user: { type: ObjectId, ref: 'User', required: true },
        action: { type: String, enum: ['added', 'declined'], required: true },
        application: { type: ObjectId, ref: 'Application' },
        at: { type: Date, default: Date.now },
      },
    ],
    expiresAt: { type: Date, required: true },
    revokedAt: Date, // the sharer stopped sharing before the link expired
    purgeAt: { type: Date, default: () => new Date(Date.now() + SHARE_HISTORY_DAYS * DAY_MS) },
  },
  { timestamps: true },
);

sharedJobSchema.index({ purgeAt: 1 }, { expireAfterSeconds: 0 });
sharedJobSchema.index({ owner: 1, application: 1 });
sharedJobSchema.index({ owner: 1, createdAt: -1 });

export const SharedJob = mongoose.model('SharedJob', sharedJobSchema);

/**
 * Shares used to be deleted when their link expired (TTL index on expiresAt). Removes that index so
 * the "Sent" history survives, and gives older shares a purge date. Safe to run on every start.
 */
export async function migrateShareRetention() {
  const col = SharedJob.collection;
  const indexes = await col.indexes().catch(() => []);
  for (const ix of indexes) {
    if (ix.key?.expiresAt === 1 && ix.expireAfterSeconds !== undefined) await col.dropIndex(ix.name);
  }
  await col.updateMany(
    { purgeAt: { $exists: false } },
    [{ $set: { purgeAt: { $add: [{ $ifNull: ['$createdAt', '$$NOW'] }, SHARE_HISTORY_DAYS * DAY_MS] } } }],
  );
}
