import crypto from 'node:crypto';
import { Application, SharedJob, User } from '../models/index.js';
import { SHARE_TTL_DAYS } from '../models/SharedJob.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { assertObjectId } from '../utils/helpers.js';
import { createApplication, duplicateFinder, findDuplicate } from '../services/applicationService.js';
import { applicationCreateSchema } from '../validators/schemas.js';
import { env } from '../config/env.js';

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');
const TOKEN_RX = /^[A-Za-z0-9_-]{43}$/; // 32 bytes, base64url
export const appUrl = (path) => `${env.clientUrl.split(',')[0].trim().replace(/\/$/, '')}${path}`;
const shareUrl = (token) => appUrl(`/share/${token}`);

/** The four fields that are ever shared, copied from one of the owner's applications. */
export const jobSnapshot = (app) => ({
  companyName: app.company.name,
  companyWebsite: app.company.website,
  jobTitle: app.jobTitle,
  jobPostingUrl: app.jobPostingUrl,
});

/**
 * Creates a share and returns its link. The token is only returned here; the database keeps its
 * SHA-256 hash, so a database leak doesn't reveal working links.
 */
export async function createShareDoc({ owner, app, recipient, message }) {
  const token = crypto.randomBytes(32).toString('base64url');
  const share = await SharedJob.create({
    tokenHash: hashToken(token),
    owner,
    application: app._id,
    recipient,
    message,
    job: jobSnapshot(app),
    expiresAt: new Date(Date.now() + SHARE_TTL_DAYS * 86_400_000),
  });
  return { share, url: shareUrl(token) };
}

const live = () => ({ expiresAt: { $gt: new Date() } });
const notFound = () => ApiError.notFound('This shared job is invalid or has expired');

/**
 * Finds a live share by its link token. Malformed, unknown and expired links all look the same, and a
 * job sent to one friend also looks missing to anyone else who gets hold of its link.
 */
async function loadByToken(token, user) {
  if (!TOKEN_RX.test(token || '')) throw notFound();
  const share = await SharedJob.findOne({ tokenHash: hashToken(token), ...live() });
  if (!share) throw notFound();
  if (share.recipient && !share.recipient.equals(user._id) && !share.owner.equals(user._id)) throw notFound();
  return share;
}

async function loadInboxItem(id, user) {
  assertObjectId(id);
  const share = await SharedJob.findOne({ _id: id, recipient: user._id, ...live() });
  if (!share) throw notFound();
  return share;
}

const asApplication = (job) => ({ company: { name: job.companyName }, jobTitle: job.jobTitle, jobPostingUrl: job.jobPostingUrl });
const findExisting = (userId, job) => findDuplicate(userId, asApplication(job));
const wantsForce = (req) => req.query.force === 'true';

async function recordResponse(share, userId, response) {
  await SharedJob.updateOne({ _id: share._id }, { $pull: { responses: { user: userId } } });
  await SharedJob.updateOne({ _id: share._id }, { $push: { responses: { user: userId, ...response } } });
}

/**
 * Adds a shared job to `user`'s applications as Saved / Interested. Returns { application, alreadyAdded }.
 * Throws 409 (with duplicateId) if they already track the same job, unless `force` ("Add anyway").
 */
async function acceptFor(share, user, { force = false } = {}) {
  if (share.owner.equals(user._id)) throw ApiError.badRequest('This is your own shared job');
  const previous = share.responses.find((r) => r.user.equals(user._id));
  if (previous?.action === 'added' && previous.application && await Application.exists({ _id: previous.application, user: user._id })) {
    return { application: { _id: previous.application }, alreadyAdded: true };
  }

  const owner = await User.findById(share.owner).select('name').lean();
  const from = owner?.name || 'a friend';
  // Run the four fields through the normal validator, exactly like a manually added application.
  const parsed = applicationCreateSchema.safeParse({
    company: { name: share.job.companyName, website: share.job.companyWebsite || undefined },
    jobTitle: share.job.jobTitle,
    jobPostingUrl: share.job.jobPostingUrl || undefined,
    status: 'saved',
    statusNote: `Shared by ${from}`,
    notes: `Shared with you by ${from} on Job Tracker.${share.message ? `\n\n"${share.message}"` : ''}`,
  });
  if (!parsed.success) throw ApiError.badRequest('This shared job has invalid details');
  const app = await createApplication(user._id, parsed.data, { force });
  await recordResponse(share, user._id, { action: 'added', application: app._id });
  return { application: { _id: app._id }, alreadyAdded: false };
}

async function declineFor(share, user) {
  if (share.owner.equals(user._id)) throw ApiError.badRequest('This is your own shared job');
  await recordResponse(share, user._id, { action: 'declined' });
}

const myResponse = (share, userId) => {
  const r = share.responses.find((x) => x.user.equals(userId));
  return r ? { action: r.action, application: r.application, at: r.at } : null;
};

// ---------------------------------------------------------------- Open links ("Share" button)

/** POST /applications/:id/share: creates a link anyone signed in can open. A new link each time. */
export const createShare = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  const app = await Application.findOne({ _id: req.params.id, user: req.user._id })
    .select('company.name company.website jobTitle jobPostingUrl').lean();
  if (!app) throw ApiError.notFound('Application not found');
  const { share, url } = await createShareDoc({ owner: req.user._id, app });
  res.status(201).json({ url, expiresAt: share.expiresAt });
});

/** GET /shares/:token: what the recipient sees. Only the four shared fields and the sharer's name. */
export const getShare = asyncHandler(async (req, res) => {
  const share = await loadByToken(req.params.token, req.user);
  const isOwner = share.owner.equals(req.user._id);
  const [owner, existing] = await Promise.all([
    User.findById(share.owner).select('name').lean(),
    isOwner ? null : findExisting(req.user._id, share.job),
  ]);
  res.json({
    job: share.job,
    message: share.message || null,
    sharedBy: owner?.name || 'A Job Tracker user',
    isOwner,
    expiresAt: share.expiresAt,
    response: myResponse(share, req.user._id),
    existingApplication: existing?._id || null,
  });
});

export const acceptShare = asyncHandler(async (req, res) => {
  const result = await acceptFor(await loadByToken(req.params.token, req.user), req.user, { force: wantsForce(req) });
  res.status(result.alreadyAdded ? 200 : 201).json(result);
});

export const declineShare = asyncHandler(async (req, res) => {
  await declineFor(await loadByToken(req.params.token, req.user), req.user);
  res.json({ ok: true });
});

// ---------------------------------------------------------------- "Shared with me" (from friends)

/** GET /shares/inbox: jobs friends sent to the signed-in user, newest first. */
export const inbox = asyncHandler(async (req, res) => {
  const shares = await SharedJob.find({ recipient: req.user._id, ...live() }).sort({ createdAt: -1 }).limit(200);
  const ownerIds = [...new Set(shares.map((s) => String(s.owner)))];
  const [owners, findExistingApp] = await Promise.all([
    User.find({ _id: { $in: ownerIds } }).select('name').lean(),
    duplicateFinder(req.user._id),
  ]);
  const existing = shares.map((s) => (myResponse(s, req.user._id) ? null : findExistingApp(asApplication(s.job))));
  const nameOf = new Map(owners.map((o) => [String(o._id), o.name]));
  res.json({
    items: shares.map((s, i) => ({
      _id: s._id,
      job: s.job,
      message: s.message || null,
      sharedBy: nameOf.get(String(s.owner)) || 'A Job Tracker user',
      sharedAt: s.createdAt,
      expiresAt: s.expiresAt,
      response: myResponse(s, req.user._id),
      existingApplication: existing[i]?._id || null,
    })),
  });
});

export const acceptInboxItem = asyncHandler(async (req, res) => {
  const result = await acceptFor(await loadInboxItem(req.params.id, req.user), req.user, { force: wantsForce(req) });
  res.status(result.alreadyAdded ? 200 : 201).json(result);
});

export const declineInboxItem = asyncHandler(async (req, res) => {
  await declineFor(await loadInboxItem(req.params.id, req.user), req.user);
  res.json({ ok: true });
});

/** POST /shares/inbox/accept-all: adds every job not yet answered. Jobs already tracked are skipped. */
export const acceptAllInbox = asyncHandler(async (req, res) => {
  const shares = await SharedJob.find({ recipient: req.user._id, 'responses.user': { $ne: req.user._id }, ...live() })
    .sort({ createdAt: 1 }).limit(100);
  let added = 0; let skipped = 0;
  for (const share of shares) {
    try {
      const r = await acceptFor(share, req.user);
      if (r.alreadyAdded) skipped += 1; else added += 1;
    } catch (e) {
      if (e.status === 409) skipped += 1; else throw e;
    }
  }
  res.json({ added, skipped });
});
