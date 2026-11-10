import { Application } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { assertObjectId } from '../utils/helpers.js';
import { buildApplicationFilter, SORTS } from '../services/applicationQuery.js';
import {
  createApplication, updateApplication, deleteApplication, duplicateApplication, getApplicationDetail, changeStatus,
} from '../services/applicationService.js';
import { syncApplicationReminders } from '../services/reminderSync.js';
import { applicationsToCsv } from '../services/exportService.js';

const LIST_FIELDS = {
  company: 1, jobTitle: 1, status: 1, applicationDate: 1, source: 1, employmentType: 1, workMode: 1,
  priority: 1, priorityRank: 1, nextFollowUpDate: 1, deadline: 1, emailUsed: 1, resume: 1, resumeSnapshot: 1,
  jobPostingUrl: 1, applicationLink: 1, tags: 1, salary: 1, updatedAt: 1, createdAt: 1, lastUpdateDate: 1,
};

async function loadOwned(req) {
  assertObjectId(req.params.id);
  const app = await Application.findOne({ _id: req.params.id, user: req.user._id });
  if (!app) throw ApiError.notFound('Application not found');
  return app;
}

export const listApplications = asyncHandler(async (req, res) => {
  const q = req.validatedQuery;
  const page = q.page || 1;
  const limit = q.limit || 20;
  const sort = SORTS[q.sort] || SORTS.newest;

  const [result] = await Application.aggregate([
    { $match: buildApplicationFilter(req.user._id, q) },
    { $addFields: { _followupSort: { $ifNull: ['$nextFollowUpDate', new Date('9999-12-31')] } } },
    { $sort: sort },
    {
      $facet: {
        items: [
          { $skip: (page - 1) * limit },
          { $limit: limit },
          { $project: LIST_FIELDS },
          { $lookup: { from: 'resumes', localField: 'resume', foreignField: '_id', as: 'resume', pipeline: [{ $project: { name: 1, version: 1, category: 1, isArchived: 1 } }] } },
          { $lookup: { from: 'emailaccounts', localField: 'emailUsed.account', foreignField: '_id', as: '_acct', pipeline: [{ $project: { email: 1, label: 1 } }] } },
          { $addFields: { resume: { $first: '$resume' }, 'emailUsed.accountInfo': { $first: '$_acct' } } },
          { $project: { _acct: 0 } },
        ],
        total: [{ $count: 'count' }],
      },
    },
  ]);

  const total = result.total[0]?.count || 0;
  res.json({ items: result.items, page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) });
});

export const exportCsv = asyncHandler(async (req, res) => {
  const apps = await Application.find(buildApplicationFilter(req.user._id, req.validatedQuery))
    .sort(SORTS[req.validatedQuery.sort] && req.validatedQuery.sort !== 'followup' ? SORTS[req.validatedQuery.sort] : SORTS.newest)
    .lean();
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="applications-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(applicationsToCsv(apps));
});

export const getApplication = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  res.json({ application: await getApplicationDetail(req.user._id, req.params.id) });
});

export const createApp = asyncHandler(async (req, res) => {
  const app = await createApplication(req.user._id, req.body, { force: req.query.force === 'true' });
  res.status(201).json({ application: await getApplicationDetail(req.user._id, app._id) });
});

export const updateApp = asyncHandler(async (req, res) => {
  const app = await loadOwned(req);
  await updateApplication(app, req.body);
  res.json({ application: await getApplicationDetail(req.user._id, app._id) });
});

export const deleteApp = asyncHandler(async (req, res) => {
  const app = await loadOwned(req);
  await deleteApplication(app);
  res.json({ message: 'Application deleted', id: app._id });
});

export const updateStatus = asyncHandler(async (req, res) => {
  const app = await loadOwned(req);
  const changed = changeStatus(app, req.body.status, req.body.note, req.body.changedAt || new Date());
  if (changed) {
    await app.save();
    await syncApplicationReminders(app);
  }
  res.json({ application: { _id: app._id, status: app.status, statusHistory: app.statusHistory, lastUpdateDate: app.lastUpdateDate }, changed });
});

export const duplicateApp = asyncHandler(async (req, res) => {
  const app = await loadOwned(req);
  const copy = await duplicateApplication(app);
  res.status(201).json({ application: copy });
});

export const addNote = asyncHandler(async (req, res) => {
  const app = await loadOwned(req);
  const text = String(req.body?.message || '').trim();
  if (!text) throw ApiError.badRequest('Note cannot be empty');
  app.log('note', text.slice(0, 1000));
  await app.save();
  res.status(201).json({ activity: app.activity });
});

export const listTags = asyncHandler(async (req, res) => {
  const tags = await Application.distinct('tags', { user: req.user._id });
  res.json({ tags: tags.filter(Boolean).sort() });
});
