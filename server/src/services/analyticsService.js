import mongoose from 'mongoose';
import { Application, Interview, Reminder, Resume, EmailAccount } from '../models/index.js';
import {
  STATUSES, STATUS_LABELS, INTERVIEW_STAGES, OFFER_STAGES, ASSESSMENT_STAGES,
} from '../utils/constants.js';
import { startOfDay, endOfDay, addDays } from '../utils/helpers.js';

const DAY = 86_400_000;
const pct = (num, den) => (den ? Math.round((num / den) * 1000) / 10 : 0);
const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const monthLabel = (key) => {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleString('en-US', { month: 'short', year: '2-digit' });
};

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

function buildDateFilter({ from, to } = {}) {
  if (!from && !to) return {};
  const range = {};
  if (from) range.$gte = startOfDay(from);
  if (to) range.$lte = endOfDay(to);
  return { applicationDate: range };
}

/** Loads applications + their interviews once and annotates each app with funnel flags. */
async function loadDataset(userId, range) {
  const user = new mongoose.Types.ObjectId(String(userId));
  const apps = await Application.find({ user, ...buildDateFilter(range) })
    .select('company.name jobTitle status source employmentType workMode applicationDate statusHistory resume emailUsed.account emailUsed.address updatedAt priority')
    .lean();
  const interviews = await Interview.find({ user, application: { $in: apps.map((a) => a._id) } })
    .select('application date type status result')
    .lean();

  const ivByApp = new Map();
  for (const iv of interviews) {
    const k = String(iv.application);
    if (!ivByApp.has(k)) ivByApp.set(k, []);
    ivByApp.get(k).push(iv);
  }

  for (const app of apps) {
    const seen = new Set([app.status, ...(app.statusHistory || []).map((h) => h.status)]);
    const ivs = ivByApp.get(String(app._id)) || [];
    const realInterviews = ivs.filter((i) => !['Online Assessment', 'Assignment'].includes(i.type));
    app._submitted = app.status !== 'saved' || seen.size > 1;
    app._interviewed = INTERVIEW_STAGES.some((s) => seen.has(s)) || realInterviews.length > 0;
    app._offered = OFFER_STAGES.some((s) => seen.has(s));
    app._assessed = ASSESSMENT_STAGES.some((s) => seen.has(s)) || ivs.some((i) => i.type === 'Online Assessment');
    app._rejected = app.status === 'rejected';
    app._interviewCount = ivs.length;

    // Days from application to first interview (by interview date, falling back to status history)
    const firstIvDate = realInterviews.map((i) => i.date).filter(Boolean).sort((a, b) => a - b)[0]
      || (app.statusHistory || []).find((h) => INTERVIEW_STAGES.includes(h.status))?.changedAt;
    app._daysToInterview = firstIvDate && app.applicationDate
      ? Math.max(0, (new Date(firstIvDate) - new Date(app.applicationDate)) / DAY)
      : null;
  }
  return { apps, interviews };
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

function monthlySeries(apps, months = 12, endDate = new Date()) {
  const keys = [];
  const end = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
  for (let i = months - 1; i >= 0; i--) keys.push(monthKey(new Date(end.getFullYear(), end.getMonth() - i, 1)));
  const rows = Object.fromEntries(keys.map((k) => [k, { key: k, name: monthLabel(k), applications: 0, interviews: 0, offers: 0, rejections: 0 }]));
  for (const a of apps) {
    const row = rows[monthKey(new Date(a.applicationDate))];
    if (!row) continue;
    row.applications += 1;
    if (a._interviewed) row.interviews += 1;
    if (a._offered) row.offers += 1;
    if (a._rejected) row.rejections += 1;
  }
  return keys.map((k) => rows[k]);
}

function weeklyActivity(apps, weeks = 12) {
  const today = startOfDay();
  const weekStart = addDays(today, -today.getDay()); // Sunday
  const buckets = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const start = addDays(weekStart, -7 * i);
    buckets.push({
      start,
      name: start.toLocaleString('en-US', { month: 'short', day: 'numeric' }),
      applications: 0,
    });
  }
  for (const a of apps) {
    const d = new Date(a.applicationDate);
    for (let i = buckets.length - 1; i >= 0; i--) {
      if (d >= buckets[i].start) {
        if (d < addDays(buckets[i].start, 7)) buckets[i].applications += 1;
        break;
      }
    }
  }
  return buckets.map(({ name, applications, start }) => ({ name, applications, start }));
}

function monthsInRange(range, apps) {
  if (range?.from && range?.to) {
    const f = new Date(range.from); const t = new Date(range.to);
    return { months: Math.min(36, Math.max(1, (t.getFullYear() - f.getFullYear()) * 12 + t.getMonth() - f.getMonth() + 1)), end: t };
  }
  if (apps.length) {
    const oldest = new Date(Math.min(...apps.map((a) => +new Date(a.applicationDate))));
    const now = range?.to ? new Date(range.to) : new Date();
    const diff = (now.getFullYear() - oldest.getFullYear()) * 12 + now.getMonth() - oldest.getMonth() + 1;
    return { months: Math.min(24, Math.max(6, diff)), end: now };
  }
  return { months: 6, end: new Date() };
}

// ---------------------------------------------------------------------------

export async function getOverview(userId) {
  const { apps } = await loadDataset(userId);
  const now = new Date();
  const user = userId;

  const [upcomingInterviews, recentApplications, overdueReminders, upcomingReminders] = await Promise.all([
    Interview.find({ user, date: { $gte: startOfDay(now) }, status: { $in: ['Scheduled', 'Rescheduled'] } })
      .sort({ date: 1 }).limit(6)
      .populate('application', 'company.name jobTitle status')
      .lean(),
    Application.find({ user }).sort({ updatedAt: -1 }).limit(6)
      .select('company.name jobTitle status updatedAt applicationDate priority').lean(),
    Reminder.find({ user, completed: false, dueDate: { $lt: startOfDay(now) } })
      .sort({ dueDate: 1 }).limit(10).populate('application', 'company.name jobTitle').lean(),
    Reminder.find({ user, completed: false, dueDate: { $gte: startOfDay(now), $lte: endOfDay(addDays(now, 7)) } })
      .sort({ dueDate: 1 }).limit(10).populate('application', 'company.name jobTitle').lean(),
  ]);

  const byStatus = statusBreakdown(apps);
  const c = Object.fromEntries(byStatus.map((s) => [s.key, s.count]));

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
      thisMonth: apps.filter((a) => monthKey(new Date(a.applicationDate)) === monthKey(now)).length,
    },
    funnel: funnelTotals(apps),
    byStatus: byStatus.filter((s) => s.count > 0),
    byCompany: countBy(apps, (a) => a.company?.name, { limit: 8 }),
    byJobType: countBy(apps, (a) => a.employmentType),
    bySource: countBy(apps, (a) => a.source),
    activity: weeklyActivity(apps, 12),
    monthly: monthlySeries(apps, 6),
    upcomingInterviews,
    recentApplications,
    reminders: { overdue: overdueReminders, upcoming: upcomingReminders },
  };
}

export async function getApplicationAnalytics(userId, range) {
  const { apps, interviews } = await loadDataset(userId, range);
  const { months, end } = monthsInRange(range, apps);
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

const perfRow = (list) => {
  const t = funnelTotals(list);
  return {
    applications: t.total, submitted: t.submitted, interviews: t.interviews, offers: t.offers,
    rejections: t.rejections, interviewRate: t.interviewRate, offerRate: t.offerRate,
  };
};

export async function getResumeAnalytics(userId, range) {
  const { apps } = await loadDataset(userId, range);
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

export async function getSourceAnalytics(userId, range) {
  const { apps } = await loadDataset(userId, range);
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
