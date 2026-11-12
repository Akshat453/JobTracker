import mongoose from 'mongoose';
import { Application, Interview, Reminder, Resume, EmailAccount } from '../models/index.js';
import {
  STATUSES, STATUS_LABELS, INTERVIEW_STAGES, OFFER_STAGES, ASSESSMENT_STAGES,
} from '../utils/constants.js';
import { startOfDay, endOfDay, addDays } from '../utils/helpers.js';
import { findWithApplication } from '../utils/withApplication.js';
import { env } from '../config/env.js';

const DAY = 86_400_000;
const pct = (num, den) => (den ? Math.round((num / den) * 1000) / 10 : 0);

// ---------------------------------------------------------------- Calendar days in the user's time zone
//
// Charts group by the user's calendar days, not the server's (Vercel runs in UTC, so an application
// logged at 2 am in India would otherwise land on the previous day, week or month).
// Days are handled as "YYYY-MM-DD" keys.

export function safeTimeZone(tz) {
  if (!tz) return null;
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return tz; } catch { return null; }
}

/** Returns a function mapping a date to its "YYYY-MM-DD" day in `tz`. */
export function dayKeyFn(tz) {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
  return (d) => {
    if (!d) return null;
    const x = new Date(d);
    if (Number.isNaN(+x)) return null;
    // Dates picked in a date field are stored as UTC midnight, and that already is the calendar day.
    if (x.getUTCHours() === 0 && x.getUTCMinutes() === 0 && x.getUTCSeconds() === 0 && x.getUTCMilliseconds() === 0) {
      return x.toISOString().slice(0, 10);
    }
    return fmt.format(x);
  };
}

const keyToDate = (key) => new Date(`${key}T00:00:00Z`);
const addDaysKey = (key, n) => new Date(+keyToDate(key) + n * DAY).toISOString().slice(0, 10);
const dayLabel = (key) => keyToDate(key).toLocaleString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const monthOf = (dayKey) => dayKey?.slice(0, 7);
const addMonthsKey = (monthKey, n) => {
  const [y, m] = monthKey.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};
// "Nov '26", so it isn't read as the date November 26.
const monthLabel = (key) => {
  const [y, m] = key.split('-').map(Number);
  return `${new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })} '${String(y).slice(2)}`;
};

/**
 * When the application was actually sent. A job saved first and applied to later counts from the
 * day its status left "Saved", unless the user edited the application date themselves.
 */
function sentAt(app) {
  const history = app.statusHistory || [];
  const first = history[0];
  if (first?.status === 'saved') {
    // Older records can differ by a few milliseconds without anyone editing the date.
    const dateEdited = first.changedAt && app.applicationDate && Math.abs(new Date(first.changedAt) - new Date(app.applicationDate)) > 60_000;
    const firstSent = history.find((h) => h.status !== 'saved');
    if (!dateEdited && firstSent?.changedAt) return firstSent.changedAt;
  }
  return app.applicationDate;
}

function countBy(items, keyFn, { limit, labelFn } = {}) {
  const map = new Map();
  for (const it of items) {
    const k = keyFn(it) || 'Unspecified';
    map.set(k, (map.get(k) || 0) + 1);
  }
  let rows = [...map.entries()].map(([key, count]) => ({ key, name: labelFn ? labelFn(key) : key, count }));
  rows.sort((a, b) => b.count - a.count);
  if (limit && rows.length > limit) {
    const rest = rows.slice(limit).reduce((s, r) => s + r.count, 0);
    rows = [...rows.slice(0, limit), { key: 'other', name: 'Others', count: rest }];
  }
  return rows;
}

const rangeKey = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);

/**
 * Loads applications + their interviews once and annotates each app with funnel flags and `_day`:
 * the user's calendar day it was sent (or saved, for jobs not applied to yet).
 * A date range keeps applications whose `_day` falls inside it, and only their interviews.
 */
async function loadDataset(userId, range, tz = env.defaultTimeZone) {
  const user = new mongoose.Types.ObjectId(String(userId));
  const dayKey = dayKeyFn(tz);
  const [allApps, allInterviews] = await Promise.all([
    Application.find({ user })
      .select('company.name jobTitle status source employmentType workMode applicationDate statusHistory resume emailUsed.account emailUsed.address updatedAt priority')
      .lean(),
    Interview.find({ user }).select('application date type status result').lean(),
  ]);

  const ivByApp = new Map();
  for (const iv of allInterviews) {
    const k = String(iv.application);
    if (!ivByApp.has(k)) ivByApp.set(k, []);
    ivByApp.get(k).push(iv);
  }

  for (const app of allApps) {
    const seen = new Set([app.status, ...(app.statusHistory || []).map((h) => h.status)]);
    const ivs = ivByApp.get(String(app._id)) || [];
    const realInterviews = ivs.filter((i) => !['Online Assessment', 'Assignment'].includes(i.type));
    app._submitted = app.status !== 'saved' || seen.size > 1;
    app._interviewed = INTERVIEW_STAGES.some((s) => seen.has(s)) || realInterviews.length > 0;
    app._offered = OFFER_STAGES.some((s) => seen.has(s));
    app._assessed = ASSESSMENT_STAGES.some((s) => seen.has(s)) || ivs.some((i) => i.type === 'Online Assessment');
    app._rejected = app.status === 'rejected';
    app._interviewCount = ivs.length;
    app._sentAt = app._submitted ? sentAt(app) : null;
    app._day = dayKey(app._sentAt || app.applicationDate);

    // Days from application to first interview (by interview date, falling back to status history)
    const firstIvDate = realInterviews.map((i) => i.date).filter(Boolean).sort((a, b) => a - b)[0]
      || (app.statusHistory || []).find((h) => INTERVIEW_STAGES.includes(h.status))?.changedAt;
    app._daysToInterview = firstIvDate && app._sentAt
      ? Math.max(0, (new Date(firstIvDate) - new Date(app._sentAt)) / DAY)
      : null;
  }
  const from = rangeKey(range?.from);
  const to = rangeKey(range?.to);
  const apps = allApps.filter((a) => (!from || a._day >= from) && (!to || a._day <= to));
  const inRange = new Set(apps.map((a) => String(a._id)));
  const interviews = from || to ? allInterviews.filter((i) => inRange.has(String(i.application))) : allInterviews;
  return { apps, interviews, dayKey };
}

function funnelTotals(apps) {
  const submitted = apps.filter((a) => a._submitted).length;
  const interviews = apps.filter((a) => a._interviewed).length;
  const offers = apps.filter((a) => a._offered).length;
  const rejections = apps.filter((a) => a._rejected).length;
  const assessments = apps.filter((a) => a._assessed).length;
  const days = apps.map((a) => a._daysToInterview).filter((d) => d != null);
  return {
    total: apps.length,
    submitted,
    assessments,
    interviews,
    offers,
    rejections,
    interviewRate: pct(interviews, submitted),
    offerRate: pct(offers, submitted),
    interviewToOfferRate: pct(offers, interviews),
    rejectionRate: pct(rejections, submitted),
    avgDaysToInterview: days.length ? Math.round((days.reduce((s, d) => s + d, 0) / days.length) * 10) / 10 : null,
  };
}

function statusBreakdown(apps) {
  const counts = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  for (const a of apps) counts[a.status] = (counts[a.status] || 0) + 1;
  return STATUSES.map((s) => ({ key: s, name: STATUS_LABELS[s], count: counts[s] }));
}

/** Sent applications per month (saved-only jobs aren't counted), with how many led to interviews / offers / rejections. */
function monthlySeries(apps, months, endMonth) {
  const keys = [];
  for (let i = months - 1; i >= 0; i--) keys.push(addMonthsKey(endMonth, -i));
  const rows = Object.fromEntries(keys.map((k) => [k, { key: k, name: monthLabel(k), applications: 0, interviews: 0, offers: 0, rejections: 0 }]));
  for (const a of apps) {
    if (!a._submitted) continue;
    const row = rows[monthOf(a._day)];
    if (!row) continue;
    row.applications += 1;
    if (a._interviewed) row.interviews += 1;
    if (a._offered) row.offers += 1;
    if (a._rejected) row.rejections += 1;
  }
  return keys.map((k) => rows[k]);
}

/** Sent applications per week (Sunday to Saturday, in the user's time zone), oldest first. Saved-only jobs aren't counted. */
export function weeklyActivity(apps, weeks, todayKey) {
  const thisWeek = addDaysKey(todayKey, -keyToDate(todayKey).getUTCDay());
  const buckets = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const start = addDaysKey(thisWeek, -7 * i);
    const end = addDaysKey(start, 6);
    buckets.push({
      start,
      end,
      name: dayLabel(start),
      range: `${dayLabel(start)} – ${dayLabel(end)}${i === 0 ? ' (this week)' : ''}`,
      applications: 0,
    });
  }
  const byStart = new Map(buckets.map((b) => [b.start, b]));
  for (const a of apps) {
    if (!a._submitted || !a._day) continue;
    const start = addDaysKey(a._day, -keyToDate(a._day).getUTCDay());
    const b = byStart.get(start);
    if (b) b.applications += 1;
  }
  return buckets;
}

const monthsBetween = (a, b) => {
  const [ya, ma] = a.split('-').map(Number); const [yb, mb] = b.split('-').map(Number);
  return (yb - ya) * 12 + (mb - ma) + 1;
};

/** Which months the monthly chart covers: the chosen range, or back to the oldest application (6–24 months). */
function monthsInRange(range, apps, todayKey) {
  const end = monthOf(rangeKey(range?.to) || todayKey);
  if (range?.from) return { months: Math.min(36, Math.max(1, monthsBetween(monthOf(rangeKey(range.from)), end))), end };
  const days = apps.map((a) => a._day).filter(Boolean).sort();
  if (days.length) return { months: Math.min(24, Math.max(6, monthsBetween(monthOf(days[0]), end))), end };
  return { months: 6, end };
}

// ---------------------------------------------------------------------------

export async function getOverview(userId, tz = env.defaultTimeZone) {
  const now = new Date();
  const user = userId;

  // Everything in parallel, with linked applications joined in the same query: one round trip.
  const [{ apps, dayKey }, upcomingInterviews, recentApplications, overdueReminders, upcomingReminders] = await Promise.all([
    loadDataset(userId, undefined, tz),
    findWithApplication(Interview, { user, date: { $gte: startOfDay(now) }, status: { $in: ['Scheduled', 'Rescheduled'] } },
      { sort: { date: 1 }, limit: 6 }),
    Application.find({ user }).sort({ updatedAt: -1 }).limit(6)
      .select('company.name jobTitle status updatedAt applicationDate priority').lean(),
    findWithApplication(Reminder, { user, completed: false, dueDate: { $lt: startOfDay(now) } },
      { sort: { dueDate: 1 }, limit: 10, fields: ['company.name', 'jobTitle'] }),
    findWithApplication(Reminder, { user, completed: false, dueDate: { $gte: startOfDay(now), $lte: endOfDay(addDays(now, 7)) } },
      { sort: { dueDate: 1 }, limit: 10, fields: ['company.name', 'jobTitle'] }),
  ]);

  const byStatus = statusBreakdown(apps);
  const c = Object.fromEntries(byStatus.map((s) => [s.key, s.count]));
  const todayKey = dayKey(now);

  return {
    stats: {
      total: apps.length,
      saved: c.saved,
      applied: c.applied,
      assessment: c.assessment_pending + c.assessment_completed,
      interviewScheduled: c.interview_scheduled,
      interviewing: c.interviewing,
      offers: c.offer + c.accepted,
      rejected: c.rejected,
      onHold: c.on_hold,
      withdrawn: c.withdrawn,
      thisMonth: apps.filter((a) => a._submitted && monthOf(a._day) === monthOf(todayKey)).length,
    },
    funnel: funnelTotals(apps),
    byStatus: byStatus.filter((s) => s.count > 0),
    byCompany: countBy(apps, (a) => a.company?.name, { limit: 8 }),
    byJobType: countBy(apps, (a) => a.employmentType),
    bySource: countBy(apps, (a) => a.source),
    activity: weeklyActivity(apps, 12, todayKey),
    monthly: monthlySeries(apps, 6, monthOf(todayKey)),
    upcomingInterviews,
    recentApplications,
    reminders: { overdue: overdueReminders, upcoming: upcomingReminders },
  };
}

export async function getApplicationAnalytics(userId, range, tz = env.defaultTimeZone) {
  const { apps, interviews, dayKey } = await loadDataset(userId, range, tz);
  const { months, end } = monthsInRange(range, apps, dayKey(new Date()));
  const interviewOutcomes = countBy(interviews, (i) => i.result);
  return {
    range: { from: range?.from || null, to: range?.to || null },
    totals: funnelTotals(apps),
    byStatus: statusBreakdown(apps),
    byCompany: countBy(apps, (a) => a.company?.name, { limit: 10 }),
    bySource: countBy(apps, (a) => a.source),
    byJobType: countBy(apps, (a) => a.employmentType),
    byWorkMode: countBy(apps, (a) => a.workMode),
    monthly: monthlySeries(apps, months, end),
    interviews: {
      total: interviews.length,
      byType: countBy(interviews, (i) => i.type),
      outcomes: interviewOutcomes,
    },
    funnel: [
      { name: 'Applied', count: apps.filter((a) => a._submitted).length },
      { name: 'Assessment', count: apps.filter((a) => a._assessed).length },
      { name: 'Interview', count: apps.filter((a) => a._interviewed).length },
      { name: 'Offer', count: apps.filter((a) => a._offered).length },
    ],
  };
}

function performanceBy(apps, keyFn) {
  const groups = new Map();
  for (const a of apps) {
    const k = keyFn(a);
    if (!k) continue;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(a);
  }
  return groups;
}

// "applications" counts sent applications only, so it matches the rates (which are per sent application).
const perfRow = (list) => {
  const t = funnelTotals(list);
  return {
    applications: t.submitted, tracked: t.total, submitted: t.submitted, interviews: t.interviews, offers: t.offers,
    rejections: t.rejections, interviewRate: t.interviewRate, offerRate: t.offerRate,
  };
};

export async function getResumeAnalytics(userId, range, tz = env.defaultTimeZone) {
  const { apps } = await loadDataset(userId, range, tz);
  const resumes = await Resume.find({ user: userId, kind: 'resume' }).lean();
  const groups = performanceBy(apps, (a) => (a.resume ? String(a.resume) : null));
  const rows = resumes.map((r) => ({
    _id: r._id, name: r.name, version: r.version, category: r.category, isArchived: r.isArchived,
    ...perfRow(groups.get(String(r._id)) || []),
  }));
  const noResume = apps.filter((a) => !a.resume);
  if (noResume.length) rows.push({ _id: null, name: 'No resume recorded', ...perfRow(noResume) });
  rows.sort((a, b) => b.applications - a.applications);
  return { resumes: rows };
}

export async function getSourceAnalytics(userId, range, tz = env.defaultTimeZone) {
  const { apps } = await loadDataset(userId, range, tz);
  const sources = [...performanceBy(apps, (a) => a.source || 'Unspecified')]
    .map(([name, list]) => ({ name, ...perfRow(list) }))
    .sort((a, b) => b.applications - a.applications);

  const accounts = await EmailAccount.find({ user: userId }).lean();
  const byAcct = performanceBy(apps, (a) => (a.emailUsed?.account ? String(a.emailUsed.account) : a.emailUsed?.address || null));
  const emails = accounts.map((acc) => ({
    _id: acc._id, name: acc.email, label: acc.label, isArchived: acc.isArchived,
    ...perfRow(byAcct.get(String(acc._id)) || []),
  }));
  // Addresses typed manually without a saved account
  for (const [k, list] of byAcct) {
    if (!accounts.some((a) => String(a._id) === k) && k.includes('@')) emails.push({ _id: null, name: k, ...perfRow(list) });
  }
  emails.sort((a, b) => b.applications - a.applications);
  return { sources, emails };
}
