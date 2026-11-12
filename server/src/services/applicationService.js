import { Application, EmailAccount, Interview, Resume, Reminder } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { STATUS_LABELS, PRIORITY_RANK } from '../utils/constants.js';
import { jobKeys, sameJob } from '../utils/jobMatch.js';
import { syncApplicationReminders, syncInterviewReminder, removeInterviewReminders } from './reminderSync.js';

const NESTED = ['company', 'salary', 'emailUsed', 'recruiter', 'referral'];
const IGNORED = ['interviews', 'statusNote', 'status', 'resume', 'documents'];

/** Combines a date (YYYY-MM-DD / Date) with an optional "HH:mm" string into a single Date. */
export function combineDateTime(date, time) {
  if (!date) return date;
  const d = new Date(date);
  if (time && /^\d{2}:\d{2}$/.test(time)) {
    const [h, m] = time.split(':').map(Number);
    // Dates from <input type="date"> arrive as UTC midnight; keep the calendar day and set local time.
    const local = new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), h, m);
    return local;
  }
  return d;
}

/** Verifies that referenced email account / resume / documents belong to the user and builds snapshots. */
async function resolveReferences(userId, body, app) {
  if (body.emailUsed && 'account' in body.emailUsed) {
    if (body.emailUsed.account) {
      const acct = await EmailAccount.findOne({ _id: body.emailUsed.account, user: userId });
      if (!acct) throw ApiError.badRequest('Selected email account was not found');
      body.emailUsed.address = acct.email;
      body.emailUsed.provider = body.emailUsed.provider || acct.provider;
    }
  }

  if ('resume' in body) {
    if (body.resume) {
      const resume = await Resume.findOne({ _id: body.resume, user: userId });
      if (!resume) throw ApiError.badRequest('Selected resume was not found');
      const changed = String(app.resume || '') !== String(resume._id);
      app.resume = resume._id;
      if (changed || !app.resumeSnapshot?.name) {
        app.resumeSnapshot = {
          name: resume.name, version: resume.version, category: resume.category,
          originalName: resume.file.originalName, attachedAt: new Date(),
        };
        if (!app.isNew) app.log('resume_attached', `Resume "${resume.name}${resume.version ? ` (${resume.version})` : ''}" attached`);
      }
    } else {
      app.resume = undefined;
      app.resumeSnapshot = undefined;
    }
  }

  if (body.documents) {
    const count = await Resume.countDocuments({ _id: { $in: body.documents }, user: userId });
    if (count !== new Set(body.documents).size) throw ApiError.badRequest('One or more documents were not found');
    app.documents = body.documents;
  }
}

function applyFields(app, body) {
  for (const [key, value] of Object.entries(body)) {
    if (IGNORED.includes(key) || value === undefined) continue;
    if (NESTED.includes(key) && value && typeof value === 'object') {
      for (const [sub, subVal] of Object.entries(value)) {
        if (subVal !== undefined) app.set(`${key}.${sub}`, subVal);
      }
    } else {
      app.set(key, value);
    }
  }
  if (body.priority) app.priorityRank = PRIORITY_RANK[body.priority];
}

export function changeStatus(app, status, note, changedAt = new Date()) {
  if (app.status === status) return false;
  const from = app.status;
  app.status = status;
  app.lastUpdateDate = changedAt;
  app.statusHistory.push({ status, from, changedAt, note: note || undefined });
  app.log('status_changed', `Status changed from ${STATUS_LABELS[from]} to ${STATUS_LABELS[status]}`, { from, to: status, note });
  return true;
}

/** Creates / updates / deletes interview rounds so they match the list sent by the form. */
async function syncInterviews(app, rounds) {
  if (!rounds) return;
  const existing = await Interview.find({ application: app._id, user: app.user });
  const keepIds = new Set(rounds.filter((r) => r._id).map((r) => String(r._id)));

  for (const iv of existing) {
    if (!keepIds.has(String(iv._id))) {
      await removeInterviewReminders(iv._id);
      await iv.deleteOne();
      app.log('interview_removed', `Interview "${iv.roundName}" removed`);
    }
  }

  for (const round of rounds) {
    const { _id, ...data } = round;
    data.date = combineDateTime(data.date, data.time);
    let iv = _id ? existing.find((e) => String(e._id) === String(_id)) : null;
    if (iv) {
      iv.set(data);
      if (iv.isModified()) {
        await iv.save();
        app.log('interview_updated', `Interview "${iv.roundName}" updated`);
      }
    } else {
      iv = await Interview.create({ ...data, user: app.user, application: app._id });
      app.log('interview_added', `Interview "${iv.roundName}" added`);
    }
    await syncInterviewReminder(iv, app);
  }
}

/**
 * Returns a function that finds the user's existing application matching a job, or null.
 * Loads the user's applications once, so checking many jobs (e.g. a whole inbox) costs one query.
 * See utils/jobMatch.js for what counts as the same job.
 */
export async function duplicateFinder(userId, excludeId) {
  const q = { user: userId };
  if (excludeId) q._id = { $ne: excludeId };
  const apps = await Application.find(q)
    .select('_id company.name jobTitle jobPostingUrl jobId applicationDate status').lean();
  const keyed = apps.map((a) => ({ app: a, keys: jobKeys(a) }));
  return (job) => {
    const keys = jobKeys(job);
    return keyed.find((k) => sameJob(keys, k.keys))?.app || null;
  };
}

export async function findDuplicate(userId, body, excludeId) {
  return (await duplicateFinder(userId, excludeId))(body);
}

export async function createApplication(userId, body, { force = false } = {}) {
  if (!force) {
    const dup = await findDuplicate(userId, body);
    if (dup) {
      throw ApiError.conflict(
        `You already have an application for ${dup.jobTitle} at ${dup.company.name}`,
        { duplicateId: dup._id },
      );
    }
  }

  const app = new Application({ user: userId });
  await resolveReferences(userId, body, app);
  applyFields(app, body);

  const status = body.status || 'applied';
  const appliedAt = body.applicationDate || new Date();
  app.applicationDate = appliedAt; // one timestamp for the date and the first history entry
  app.status = status;
  app.lastUpdateDate = body.lastUpdateDate || new Date();
  app.statusHistory = [{ status, from: null, changedAt: appliedAt, note: body.statusNote || 'Application created' }];
  app.log('created', `Application created with status ${STATUS_LABELS[status]}`);
  if (app.resume) app.log('resume_attached', `Resume "${app.resumeSnapshot.name}" attached`);

  await app.save();
  await syncInterviews(app, body.interviews);
  if (app.isModified()) await app.save();
  await syncApplicationReminders(app);
  return app;
}

export async function updateApplication(app, body) {
  await resolveReferences(app.user, body, app);
  applyFields(app, body);

  const changedPaths = app.modifiedPaths().filter((p) => !p.includes('.') && !['activity', 'priorityRank'].includes(p));
  if (body.status) changeStatus(app, body.status, body.statusNote);
  if (!body.lastUpdateDate) app.lastUpdateDate = new Date();
  if (changedPaths.length) app.log('updated', 'Application details updated', { fields: changedPaths });

  await syncInterviews(app, body.interviews);
  await app.save();
  await syncApplicationReminders(app);
  return app;
}

export async function deleteApplication(app) {
  await Interview.deleteMany({ application: app._id, user: app.user });
  await Reminder.deleteMany({ application: app._id, user: app.user });
  await app.deleteOne();
}

export async function duplicateApplication(app) {
  const src = app.toObject({ virtuals: false });
  const omit = ['_id', 'createdAt', 'updatedAt', '__v', 'statusHistory', 'activity', 'id'];
  omit.forEach((k) => delete src[k]);
  const copy = new Application({
    ...src,
    jobTitle: `${src.jobTitle} (copy)`,
    status: 'saved',
    applicationDate: new Date(),
    lastUpdateDate: new Date(),
    nextFollowUpDate: undefined,
    statusHistory: [{ status: 'saved', from: null, changedAt: new Date(), note: 'Duplicated' }],
  });
  copy.log('duplicated', `Duplicated from "${app.jobTitle}" at ${app.company.name}`, { sourceId: app._id });
  await copy.save();
  return copy;
}

/** Loads one application owned by the user with all related records populated. */
export async function getApplicationDetail(userId, id) {
  const app = await Application.findOne({ _id: id, user: userId })
    .populate('resume')
    .populate('documents')
    .populate('emailUsed.account')
    .populate('interviews')
    .populate('reminders');
  if (!app) throw ApiError.notFound('Application not found');
  return app;
}
