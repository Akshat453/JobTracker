import crypto from 'node:crypto';
import mongoose from 'mongoose';
import * as chrono from 'chrono-node';
import { Application, Reminder, User } from '../../models/index.js';
import { env } from '../../config/env.js';
import { STATUS_LABELS } from '../../utils/constants.js';
import { MongoRateLimitStore } from '../../utils/mongoRateLimitStore.js';
import { createApplication, duplicateFinder, guessSource } from '../applicationService.js';
import { jobLinkInfo } from '../jobLinkInfo.js';
import { postingKey } from '../../utils/jobMatch.js';
import { sendText, insideFreeWindow } from './client.js';

/**
 * The WhatsApp bot: connects a number to an account, saves jobs from links, and sets and lists
 * reminders. Every incoming text message goes through handleIncoming().
 */

const PENDING_MINUTES = 30;
const LINK_CODE_MINUTES = 10;
export const hashCode = (code) => crypto.createHash('sha256').update(code.toUpperCase().replace(/[^A-Z0-9]/g, '')).digest('hex');

// Wrong connect codes per number, and replies to numbers that aren't connected (stops abuse).
const linkAttempts = new MongoRateLimitStore({ prefix: 'wa-link' });
linkAttempts.init({ windowMs: 60 * 60_000 });
const strangerReplies = new MongoRateLimitStore({ prefix: 'wa-stranger' });
strangerReplies.init({ windowMs: 60 * 60_000 });

const site = () => env.clientUrl.split(',')[0].trim().replace(/\/$/, '');

export const HELP = [
  "Here's what I can do:",
  '',
  '*Save a job*: send the job link and the company name, e.g.',
  'https://jobs.lever.co/acme/123 Acme',
  "Just the link works too; I'll find the company, website and job title.",
  'You can also forward job posts from groups, several at once.',
  '',
  '*Set a reminder*: remind me to call the recruiter tomorrow 5pm',
  '*See reminders*: reminders',
  '*See saved jobs*: saved',
  '*Disconnect WhatsApp*: disconnect',
].join('\n');

// ---------- connecting ----------
/** Creates a one-time code the user sends from WhatsApp to prove the number is theirs. */
export async function createLinkCode(user) {
  const raw = crypto.randomBytes(5).toString('hex').toUpperCase(); // 40 bits
  const code = `JT-${raw.slice(0, 5)}-${raw.slice(5)}`;
  await User.updateOne({ _id: user._id }, {
    whatsappLinkCode: hashCode(code), whatsappLinkExpiresAt: new Date(Date.now() + LINK_CODE_MINUTES * 60_000),
  });
  return { code, expiresInMinutes: LINK_CODE_MINUTES };
}

async function link(phone, code, reply, sentAt) {
  const { totalHits } = await linkAttempts.increment(phone);
  if (totalHits > 5) return reply('Too many attempts. Please try again in an hour.');
  const user = await User.findOneAndUpdate(
    { whatsappLinkCode: hashCode(code), whatsappLinkExpiresAt: { $gt: new Date() }, whatsappOff: { $ne: true } },
    { $unset: { whatsappLinkCode: 1, whatsappLinkExpiresAt: 1 } },
    { new: true },
  );
  if (!user) return reply(`That code is wrong or has expired. Get a new one in Settings → WhatsApp on ${site()}/settings`);
  // A number belongs to one account: connecting it here disconnects it anywhere else.
  await User.updateMany({ 'whatsapp.phone': phone, _id: { $ne: user._id } }, { $unset: { whatsapp: 1 } });
  user.whatsapp = { phone, linkedAt: new Date(), remindersEnabled: true, lastInboundAt: sentAt };
  await user.save();
  return reply(`✅ Connected to Job Tracker as ${user.name}.\n\n${HELP}`);
}

// ---------- saving jobs ----------
const URL_RE = /\b((?:https?:\/\/|www\.)[^\s<>"'*]+)/gi;
const MAX_LINKS_PER_MESSAGE = 10;
// Links in group posts that are never job postings.
const NOT_JOBS = /(^|\.)(chat\.whatsapp\.com|wa\.me|whatsapp\.com|t\.me|telegram\.me|instagram\.com|youtube\.com|youtu\.be|facebook\.com|fb\.me|twitter\.com|x\.com|discord\.gg|discord\.com|linktr\.ee|play\.google\.com|apps\.apple\.com)$/i;

function normaliseUrl(raw) {
  try {
    const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (!['http:', 'https:'].includes(u.protocol) || !u.hostname.includes('.')) return null;
    if (NOT_JOBS.test(u.hostname.replace(/^www\./, ''))) return null;
    return u.toString().slice(0, 2000);
  } catch { return null; }
}

const clean = (s, max) => String(s || '')
  .replace(/\p{Extended_Pictographic}|️|‍/gu, '')
  .replace(/[*_~`]+/g, '') // WhatsApp bold/italic markers
  .replace(/\s+/g, ' ')
  .replace(/^[\s:,\-–—|•·.]+|[\s:,\-–—|•·!.]+$/g, '')
  .trim()
  .slice(0, max);

/** Company / role written in a group post: "Company: X", "Role: Y", "X is hiring Y", "Y at X". */
export function guessFromText(text) {
  const out = { companyName: '', jobTitle: '' };
  const label = (re) => clean(re.exec(text)?.[1], 160);
  out.companyName = clean(label(/(?:^|\n)\s*[^\n\w]*\s*(?:company|organi[sz]ation|org|employer)(?:\s*name)?\s*[:=\-–]\s*([^\n]+)/i), 120);
  out.jobTitle = label(/(?:^|\n)\s*[^\n\w]*\s*(?:role|position|job\s*title|title|designation|profile|job\s*role|opening|post)\s*[:=\-–]\s*([^\n]+)/i);
  const hiring = /(?:^|\n)[^\n\w]*([A-Z][\w&.,'()\- ]{1,60}?)\s+(?:is\s+)?hiring\s*(?:for\s+(?:the\s+)?(?:role\s+of\s+)?)?(?:an?\s+)?[:\-–]?\s*([^\n|(]{2,120})/i.exec(text);
  if (hiring) {
    out.companyName ||= clean(hiring[1], 120);
    out.jobTitle ||= clean(hiring[2].replace(/\s+(?:in|at|for|-|–)\s+.*$/i, ''), 160);
  }
  const at = /(?:^|\n)[^\n\w]*([A-Z][^\n@|]{2,80}?)\s+(?:at|@)\s+([A-Z][\w&.'\- ]{1,60})/.exec(text);
  if (at && !/https?:/.test(at[0])) {
    out.jobTitle ||= clean(at[1], 160);
    out.companyName ||= clean(at[2], 120);
  }
  if (/^(we|we're|we are|they|our team|urgent|urgently)$/i.test(out.companyName)) out.companyName = '';
  return out;
}

/**
 * The job links in a message, with any company / title written next to them.
 * - A short typed message ("https://… Acme") treats the rest of the text as the company name.
 * - A longer post (forwarded from a group, several lines) is read for labels and "X is hiring Y".
 * - Several links → one job each, using the text on the same line.
 */
export function extractJobs(text) {
  const found = [...text.matchAll(URL_RE)]
    .map((m) => ({ m, url: normaliseUrl(m[1].replace(/[),.;!?\]]+$/, '')) }))
    .filter((x) => x.url);
  const seen = new Set();
  const links = found.filter((x) => (seen.has(x.url) ? false : seen.add(x.url))).slice(0, MAX_LINKS_PER_MESSAGE);
  if (!links.length) return [];

  const without = text.replace(URL_RE, ' ');
  if (links.length === 1) {
    const rest = without.replace(/\s+/g, ' ').trim();
    const typed = !/\n/.test(text.trim().replace(URL_RE, '').trim()) && rest.length <= 60;
    if (typed) {
      const parts = guessFromText(without);
      const companyName = parts.companyName || clean(rest
        .replace(/\b(?:company(?:\s*name)?)\s*[:=-]\s*/i, ' ')
        .replace(/\b(?:title|role|position)\s*[:=-].*$/i, ' ')
        .replace(/^\s*(?:add|save|new|job|saved|link)\b[\s:,-]*/i, ''), 120);
      return [{ url: links[0].url, companyName, jobTitle: parts.jobTitle, post: false }];
    }
    return [{ url: links[0].url, ...guessFromText(without), post: true }];
  }
  return links.map(({ m, url }) => {
    const lineStart = text.lastIndexOf('\n', m.index) + 1;
    const lineEnd = text.indexOf('\n', m.index);
    const line = text.slice(lineStart, lineEnd === -1 ? undefined : lineEnd).replace(URL_RE, ' ');
    const g = guessFromText(line);
    // "Acme - SDE 1: https://…" on one line
    const pair = /^[^\w]*([^\n:–—|-]{2,60}?)\s*[–—|-]\s*([^\n:]{2,120}?)\s*:?\s*$/.exec(line.trim());
    return { url, companyName: g.companyName || clean(pair?.[1], 120), jobTitle: g.jobTitle || clean(pair?.[2], 160), post: true };
  });
}

/** Kept for compatibility: the first job in a message, or null. */
export function parseJobMessage(text) {
  const [job] = extractJobs(text);
  return job ? { url: job.url, companyName: job.companyName, jobTitle: job.jobTitle } : null;
}

const withTimeout = (p, ms, fallback) => Promise.race([p, new Promise((r) => setTimeout(() => r(fallback), ms))]);

async function setPending(user, pending) {
  await User.updateOne({ _id: user._id }, pending ? { 'whatsapp.pending': { ...pending, expiresAt: new Date(Date.now() + PENDING_MINUTES * 60_000) } } : { $unset: { 'whatsapp.pending': 1 } });
}

// Two copies of the same job forwarded at the same moment arrive as separate requests; this claim
// makes sure only one of them saves it.
let claimsIndexed = null;
async function claimJob(userId, url) {
  const col = mongoose.connection.db.collection('whatsappjobclaims');
  claimsIndexed ||= col.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }).catch(() => { claimsIndexed = null; });
  const _id = `${userId}:${postingKey(url) || url}`;
  const now = new Date();
  const res = await col.updateOne(
    { _id, expiresAt: { $lte: now } },
    { $set: { expiresAt: new Date(now.getTime() + 2 * 60_000) } },
    { upsert: true },
  ).catch((e) => (e.code === 11000 ? null : Promise.reject(e)));
  return Boolean(res);
}

async function releaseJob(userId, url) {
  await mongoose.connection.db.collection('whatsappjobclaims').deleteOne({ _id: `${userId}:${postingKey(url) || url}` }).catch(() => {});
}

// Per user, so a flood of forwards can't fill the database.
const jobsPerHour = new MongoRateLimitStore({ prefix: 'wa-jobs' });
jobsPerHour.init({ windowMs: 60 * 60_000 });
const MAX_JOBS_PER_HOUR = 60;

const nameFromWebsite = (website) => {
  try { return new URL(website).hostname.split('.').slice(-2, -1)[0].replace(/^\w/, (c) => c.toUpperCase()); } catch { return ''; }
};

const appLink = (id) => `${site()}/applications/${id}`;
const already = (dup) => `Already saved: ${dup.jobTitle} at ${dup.company.name} (${STATUS_LABELS[dup.status]})\n${appLink(dup._id)}`;

/**
 * Saves one job. Returns { text } for the reply, or { ask } when a typed single link needs the company
 * or title (forwarded posts never ask: they're saved with what was found, and flagged).
 */
async function saveOne(user, job, opts) {
  if (!(await claimJob(user._id, job.url))) return { text: `Already saving this job (it arrived twice): ${job.url}` };
  try { return await saveClaimed(user, job, opts); } finally { await releaseJob(user._id, job.url); }
}

async function saveClaimed(user, job, { interactive }) {
  const findDup = await duplicateFinder(user._id);
  const byLink = findDup({ jobPostingUrl: job.url, company: { name: '' }, jobTitle: '' });
  if (byLink) return { text: already(byLink) };

  const info = await withTimeout(jobLinkInfo(job.url).catch(() => ({})), 8000, {});
  const companyName = clean(job.companyName || info.companyName, 120);
  const jobTitle = clean(job.jobTitle || info.jobTitle, 160);
  const website = info.website || '';
  if (interactive && (!companyName || !jobTitle)) return { ask: { url: job.url, companyName, jobTitle, website } };

  const missing = [];
  const body = {
    company: { name: companyName || nameFromWebsite(website) || 'Unknown company', ...(website ? { website } : {}) },
    jobTitle: jobTitle || 'Untitled role',
    jobPostingUrl: job.url,
    status: 'saved',
    statusNote: 'Added from WhatsApp',
  };
  if (!companyName) missing.push('company');
  if (!jobTitle) missing.push('job title');
  body.source = guessSource({ jobPostingUrl: job.url, company: body.company });
  const dup = findDup(body);
  if (dup) return { text: already(dup) };
  const { totalHits } = await jobsPerHour.increment(String(user._id));
  if (totalHits > MAX_JOBS_PER_HOUR) return { text: `Not saved: more than ${MAX_JOBS_PER_HOUR} jobs in an hour. Try again later.` };
  const app = await createApplication(user._id, body, { force: true });
  return {
    text: [
      `✅ Saved: *${app.jobTitle}* at *${app.company.name}*`,
      missing.length ? `⚠️ Couldn't find the ${missing.join(' or ')}; please fix it on the website.` : '',
      appLink(app._id),
    ].filter(Boolean).join('\n'),
  };
}

/** One or more job links from a message. Several links / forwarded posts are saved without questions. */
async function addJobs(user, jobs, reply) {
  if (jobs.length === 1 && !jobs[0].post) {
    const r = await saveOne(user, jobs[0], { interactive: true });
    if (r.ask) return askFor(user, r.ask, reply);
    await setPending(user, null);
    return reply(r.text);
  }
  const results = await Promise.all(jobs.map((j) => saveOne(user, j, { interactive: false })
    .catch((e) => ({ text: `Couldn't save ${j.url} (${e.message})` }))));
  return reply(results.map((r) => r.text).join('\n\n'));
}

async function askFor(user, job, reply) {
  if (!job.companyName) {
    await setPending(user, { ...job, step: 'company' });
    return reply("What's the company name? (Reply *cancel* to stop.)");
  }
  await setPending(user, { ...job, step: 'title' });
  return reply(`Got it: ${job.companyName}. What's the job title? (Reply *skip* to save without one.)`);
}

async function continuePending(user, pending, text, reply) {
  if (/^(cancel|stop|no)$/i.test(text)) { await setPending(user, null); return reply('OK, not saved.'); }
  const value = clean(text, 160);
  const job = pending.step === 'company'
    ? { ...pending, companyName: value.slice(0, 120) }
    : { ...pending, jobTitle: /^skip$/i.test(value) ? 'Untitled role' : value };
  if (!job.jobTitle) return askFor(user, job, reply);
  await setPending(user, null);
  const r = await saveOne(user, { ...job, post: false }, { interactive: false });
  return reply(r.text);
}

// ---------- reminders ----------
const tzOf = (user) => {
  const tz = user.notificationPrefs?.timeZone || env.defaultTimeZone;
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return tz; } catch { return 'UTC'; }
};
/** Minutes ahead of UTC for a time zone at a moment (what chrono needs). */
function offsetMinutes(timeZone, at) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    .formatToParts(at).map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
  return Math.round((asUtc - Math.floor(at.getTime() / 60_000) * 60_000) / 60_000);
}
export const formatWhen = (date, timeZone) => date.toLocaleString('en-US', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone });

/** "remind me to call HR tomorrow at 5pm" → { title, dueDate } (null if no time was found). */
export function parseReminder(text, timeZone, now = new Date()) {
  const body = text.replace(/^\s*(?:set\s+(?:a\s+)?)?remind(?:er)?(?:\s+me)?(?:\s+to)?\b[\s:,-]*/i, '');
  const [hit] = chrono.parse(body, { instant: now, timezone: offsetMinutes(timeZone, now) }, { forwardDate: true });
  if (!hit) return null;
  if (!hit.start.isCertain('hour')) { hit.start.imply('hour', 9); hit.start.imply('minute', 0); }
  const title = `${body.slice(0, hit.index)} ${body.slice(hit.index + hit.text.length)}`
    .replace(/\s+(?:at|on|by|in|for)\s*$/i, '')
    .replace(/^\s*(?:to|that)\s+/i, '')
    .replace(/\s+/g, ' ').replace(/^[\s,:-]+|[\s,:-]+$/g, '').trim();
  return { title: (title || 'Reminder').slice(0, 200), dueDate: hit.start.date() };
}

async function addReminder(user, text, reply) {
  const tz = tzOf(user);
  const parsed = parseReminder(text, tz);
  if (!parsed) return reply('When should I remind you? For example:\nremind me to call the recruiter tomorrow 5pm');
  if (parsed.dueDate <= new Date()) return reply('That time has already passed. Try a time in the future.');
  const open = await Reminder.countDocuments({ user: user._id, completed: false, viaWhatsApp: true });
  if (open >= 200) return reply('You have too many open reminders. Complete some on the website first.');
  await Reminder.create({ user: user._id, title: parsed.title, dueDate: parsed.dueDate, type: 'custom', origin: 'manual', viaWhatsApp: true });
  return reply(`⏰ Reminder set: *${parsed.title}*\n${formatWhen(parsed.dueDate, tz)}${user.whatsapp?.remindersEnabled === false ? '\n(WhatsApp reminders are off in your settings, so it will only show on the website.)' : "\nI'll message you here."}`);
}

async function listReminders(user, reply) {
  const tz = tzOf(user);
  const items = await Reminder.find({ user: user._id, completed: false }).sort({ dueDate: 1 }).limit(8).lean();
  if (!items.length) return reply('No open reminders. Set one with: remind me to … tomorrow 10am');
  const now = new Date();
  return reply(`Your reminders:\n\n${items.map((r) => `• ${r.title}\n  ${r.dueDate < now ? 'Was due' : 'Due'} ${formatWhen(r.dueDate, tz)}`).join('\n')}\n\nAll: ${site()}/reminders`);
}

async function listSaved(user, reply) {
  const apps = await Application.find({ user: user._id, status: 'saved' }).sort({ createdAt: -1 }).limit(8).select('company.name jobTitle').lean();
  if (!apps.length) return reply('No saved jobs yet. Send me a job link to save one.');
  return reply(`Latest saved jobs:\n\n${apps.map((a) => `• ${a.jobTitle} at ${a.company.name}`).join('\n')}\n\nAll: ${site()}/applications?status=saved`);
}

// ---------- entry point ----------
let indexed = null;
/** True the first time a message id is seen (Meta retries deliveries, so the same message can arrive twice). */
async function firstDelivery(id) {
  const col = mongoose.connection.db.collection('whatsappmessages');
  indexed ||= col.createIndex({ at: 1 }, { expireAfterSeconds: 3 * 86400 }).catch(() => { indexed = null; });
  try { await col.insertOne({ _id: String(id), at: new Date() }); return true; } catch (e) { if (e.code === 11000) return false; throw e; }
}

/** Handles one incoming WhatsApp message: { id, from, text }. Replies on WhatsApp. */
export async function handleIncoming({ id, from, text, timestamp, forwarded = false }) {
  if (!id || !/^\d{6,15}$/.test(from || '') || !(await firstDelivery(id))) return;
  // When the person sent it (Meta's timestamp; it may be redelivered much later). Replies are only
  // sent inside the free window that this message opened, and never for messages that are too old.
  const now = new Date();
  const sentAt = Number.isFinite(Number(timestamp)) && Number(timestamp) > 0 ? new Date(Math.min(Number(timestamp) * 1000, now.getTime())) : now;
  const reply = (body) => sendText(from, body, { lastInboundAt: sentAt });
  const msg = String(text || '').trim().slice(0, 3000);

  const code = /^(?:link|connect)\s+(JT-?[A-F0-9]{5}-?[A-F0-9]{5})\b/i.exec(msg);
  if (code) return insideFreeWindow(sentAt) ? link(from, code[1], reply, sentAt) : undefined;

  const user = await User.findOne({ 'whatsapp.phone': from }).select('+whatsapp.pending');
  if (!user) {
    if (!insideFreeWindow(sentAt)) return undefined;
    const { totalHits } = await strangerReplies.increment(from);
    if (totalHits > 2) return undefined;
    return reply(`Hi! This number isn't connected to a Job Tracker account yet. Sign in at ${site()}/settings and use "Connect WhatsApp".`);
  }
  // Keep the newest time only (an old redelivered message mustn't move it back).
  await User.updateOne({ _id: user._id, $or: [{ 'whatsapp.lastInboundAt': { $lt: sentAt } }, { 'whatsapp.lastInboundAt': null }] }, { 'whatsapp.lastInboundAt': sentAt });
  if (!insideFreeWindow(sentAt)) return undefined;
  if (!msg) return reply(`I can only read text messages.\n\n${HELP}`);

  const lower = msg.toLowerCase();
  const pending = user.whatsapp?.pending?.expiresAt > new Date() ? user.whatsapp.pending : null;
  // Forwarded messages never start a question-and-answer, so several can arrive at once.
  const jobs = extractJobs(msg).map((j) => ({ ...j, post: j.post || forwarded }));
  if (jobs.length) return addJobs(user, jobs, reply);
  if (/^(hi|hello|hey|help|menu|start|\?)\W*$/.test(lower)) return reply(HELP);
  if (/^(disconnect|unlink|logout)\W*$/.test(lower) || (!pending && lower === 'stop')) {
    await User.updateOne({ _id: user._id }, { $unset: { whatsapp: 1 } });
    return reply('Disconnected. You can connect again any time from Settings on the website.');
  }
  if (/^(reminders?|list|upcoming)\W*$/.test(lower)) return listReminders(user, reply);
  if (/^(saved|jobs|saved jobs)\W*$/.test(lower)) return listSaved(user, reply);
  if (/^(set\s+(a\s+)?)?remind/.test(lower)) return addReminder(user, msg, reply);
  if (pending) return continuePending(user, pending, msg, reply);
  return reply(`Sorry, I didn't understand that.\n\n${HELP}`);
}
