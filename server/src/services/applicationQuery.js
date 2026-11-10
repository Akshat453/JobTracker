import mongoose from 'mongoose';
import { escapeRegex, startOfDay, endOfDay } from '../utils/helpers.js';

const ids = (csv) => String(csv).split(',').filter((v) => mongoose.isValidObjectId(v)).map((v) => new mongoose.Types.ObjectId(v));
const list = (csv) => String(csv).split(',').map((s) => s.trim()).filter(Boolean);

/** Builds a Mongo filter from the Applications page filters. All filters combine with AND. */
export function buildApplicationFilter(userId, q = {}) {
  const filter = { user: new mongoose.Types.ObjectId(String(userId)) };

  if (q.search) {
    const rx = new RegExp(escapeRegex(q.search), 'i');
    filter.$or = [{ 'company.name': rx }, { jobTitle: rx }, { jobId: rx }, { tags: rx }];
  }
  if (q.status) filter.status = { $in: list(q.status) };
  if (q.employmentType) filter.employmentType = { $in: list(q.employmentType) };
  if (q.source) filter.source = { $in: list(q.source) };
  if (q.priority) filter.priority = { $in: list(q.priority) };
  if (q.tag) filter.tags = { $in: list(q.tag).map((t) => t.toLowerCase()) };

  if (q.emailAccount) {
    if (q.emailAccount === 'none') filter['emailUsed.account'] = null;
    else filter['emailUsed.account'] = { $in: ids(q.emailAccount) };
  }
  if (q.resume) {
    if (q.resume === 'none') filter.resume = null;
    else filter.resume = { $in: ids(q.resume) };
  }
  if (q.from || q.to) {
    filter.applicationDate = {};
    if (q.from) filter.applicationDate.$gte = startOfDay(q.from);
    if (q.to) filter.applicationDate.$lte = endOfDay(q.to);
  }
  return filter;
}

export const SORTS = {
  newest: { applicationDate: -1, _id: -1 },
  oldest: { applicationDate: 1, _id: 1 },
  priority: { priorityRank: -1, applicationDate: -1 },
  followup: { _followupSort: 1, nextFollowUpDate: 1 },
  updated: { updatedAt: -1 },
  company: { 'company.name': 1, applicationDate: -1 },
};
