import { Application } from '../models/index.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import {
  getOverview, getApplicationAnalytics, getResumeAnalytics, getSourceAnalytics, safeTimeZone,
} from '../services/analyticsService.js';
import { env } from '../config/env.js';
import { buildApplicationFilter } from '../services/applicationQuery.js';
import { writePdfReport } from '../services/exportService.js';

function range(req) {
  const parse = (v) => {
    if (!v) return undefined;
    const d = new Date(v);
    if (Number.isNaN(+d)) throw ApiError.badRequest('Invalid date range');
    return d;
  };
  const from = parse(req.query.from);
  const to = parse(req.query.to);
  if (from && to && from > to) throw ApiError.badRequest('"From" date must be before "To" date');
  return { from, to };
}

/** The browser's time zone (sent as ?tz=), else the one saved with the user's settings, else the default. */
const tzOf = (req) => safeTimeZone(String(req.query.tz || '')) || safeTimeZone(req.user.notificationPrefs?.timeZone) || env.defaultTimeZone;

export const overview = asyncHandler(async (req, res) => res.json(await getOverview(req.user._id, tzOf(req))));
export const applications = asyncHandler(async (req, res) => res.json(await getApplicationAnalytics(req.user._id, range(req), tzOf(req))));
export const resumes = asyncHandler(async (req, res) => res.json(await getResumeAnalytics(req.user._id, range(req), tzOf(req))));
export const sources = asyncHandler(async (req, res) => res.json(await getSourceAnalytics(req.user._id, range(req), tzOf(req))));

export const pdfReport = asyncHandler(async (req, res) => {
  const r = range(req);
  const [analytics, resumeStats, sourceStats, apps] = await Promise.all([
    getApplicationAnalytics(req.user._id, r, tzOf(req)),
    getResumeAnalytics(req.user._id, r, tzOf(req)),
    getSourceAnalytics(req.user._id, r, tzOf(req)),
    Application.find(buildApplicationFilter(req.user._id, r)).sort({ applicationDate: -1 }).lean(),
  ]);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="job-search-report-${new Date().toISOString().slice(0, 10)}.pdf"`);
  writePdfReport(res, { user: req.user, range: r, analytics, resumes: resumeStats, sources: sourceStats, apps });
});
