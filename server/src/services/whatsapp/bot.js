import crypto from 'node:crypto';
import mongoose from 'mongoose';
import * as chrono from 'chrono-node';
import { Application, Reminder, User } from '../../models/index.js';
import { env } from '../../config/env.js';
import { STATUS_LABELS } from '../../utils/constants.js';
import { MongoRateLimitStore } from '../../utils/mongoRateLimitStore.js';
import { createApplication, duplicateFinder, guessSource } from '../applicationService.js';
import { jobLinkInfo } from '../jobLinkInfo.js';
import { sendText } from './client.js';

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

async function link(phone, code, reply) {
  const { totalHits } = await linkAttempts.increment(phone);
  if (totalHits > 5) return reply('Too many attempts. Please try again in an hour.');
  const user = await User.findOneAndUpdate(
    { whatsappLinkCode: hashCode(code), whatsappLinkExpiresAt: { $gt: new Date() } },
    { $unset: { whatsappLinkCode: 1, whatsappLinkExpiresAt: 1 } },
    { new: true },
  );
  if (!user) return reply(`That code is wrong or has expired. Get a new one in Settings → WhatsApp on ${site()}/settings`);
  // A number belongs to one account: connecting it here disconnects it anywhere else.
  await User.updateMany({ 'whatsapp.phone': phone, _id: { $ne: user._id } }, { $unset: { whatsapp: 1 } });
  user.whatsapp = { phone, linkedAt: new Date(), remindersEnabled: true, lastInboundAt: new Date() };
  await user.save();
  return reply(`✅ Connected to Job Tracker as ${user.name}.\n\n${HELP}`);
}

// ---------- saving jobs ----------
const URL_RE = /\b((?:https?:\/\/|www\.)[^\s<>"']+)/i;

function normaliseUrl(raw) {
  try {
    const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (!['http:', 'https:'].includes(u.protocol) || !u.hostname.includes('.')) return null;
    return u.toString().slice(0, 2000);
  } catch { return null; }
}

/** "add https://… Acme" / "Acme\nhttps://…" / "https://… company: Acme title: SDE" → parts. */
export function parseJobMessage(text) {
  const m = URL_RE.exec(text);
  if (!m) return null;
  const url = normaliseUrl(m[1].replace(/[),.;!?]+$/, ''));
  if (!url) return null;
  let rest = `${text.slice(0, m.index)} ${text.slice(m.index + m[0].length)}`;
  let jobTitle = '';
  const t = /\b(?:title|role|position)\s*[:=-]\s*([^\n]+)/i.exec(rest);
  if (t) { jobTitle = t[1].trim(); rest = rest.replace(t[0], ' '); }
  const companyName = rest
    .replace(/\b(?:company(?:\s*name)?)\s*[:=-]\s*/i, ' ')
    .replace(/^\s*(?:add|save|new|job|saved|link)\b[\s:,-]*/i, '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s:,\-–—|]+|[\s:,\-–—|]+$/g, '')
    .trim();
  return { url, companyName: companyName.slice(0, 120), jobTitle: jobTitle.slice(0, 160) };
}

const withTimeout = (p, ms, fallback) => Promise.race([p, new Promise((r) => setTimeout(() => r(fallback), ms))]);

async function setPending(user, pending) {
  await User.updateOne({ _id: user._id }, pending ? { 'whatsapp.pending': { ...pending, expiresAt: new Date(Date.now() + PENDING_MINUTES * 60_000) } } : { $unset: { 'whatsapp.pending': 1 } });
}

async function saveJob(user, job, reply) {
  if (!job.companyName) {
    await setPending(user, { ...job, step: 'company' });
    return reply("What's the company name? (Reply *cancel* to stop.)");
  }
  if (!job.jobTitle) {
    await setPending(user, { ...job, step: 'title' });
    return reply(`Got it: ${job.companyName}. What's the job title? (Reply *skip* to save without one.)`);
  }
  await setPending(user, null);
  const body = {
    company: { name: job.companyName, ...(job.website ? { website: job.website } : {}) },
    jobTitle: job.jobTitle,
    jobPostingUrl: job.url,
    status: 'saved',
    statusNote: 'Added from WhatsApp',
  };
  body.source = guessSource({ jobPostingUrl: job.url, company: body.company });
  const dup = (await duplicateFinder(user._id))(body);
  if (dup) return reply(`You already have this one: ${dup.jobTitle} at ${dup.company.name} (${STATUS_LABELS[dup.status]}).\n${site()}/applications/${dup._id}`);
  const app = await createApplication(user._id, body, { force: true });
  return reply([
    `✅ Saved: *${app.jobTitle}* at *${app.company.name}*`,
    app.company.website ? `Website: ${app.company.website}` : '',
    `${site()}/applications/${app._id}`,
  ].filter(Boolean).join('\n'));
}

async function addJob(user, parsed, reply) {
  const linkOnly = { jobPostingUrl: parsed.url, company: { name: '' }, jobTitle: '' };
  const byLink = (await duplicateFinder(user._id))(linkOnly);
  if (byLink) return reply(`You already have this one: ${byLink.jobTitle} at ${byLink.company.name} (${STATUS_LABELS[byLink.status]}).\n${site()}/applications/${byLink._id}`);
  const info = await withTimeout(jobLinkInfo(parsed.url).catch(() => ({})), 9000, {});
  return saveJob(user, {
    url: parsed.url,
    companyName: parsed.companyName || info.companyName || '',
    jobTitle: parsed.jobTitle || info.jobTitle || '',
    website: info.website || '',
  }, reply);
}

async function continuePending(user, pending, text, reply) {
  if (/^(cancel|stop|no)$/i.test(text)) { await setPending(user, null); return reply('OK, not saved.'); }
  const value = text.replace(/\s+/g, ' ').trim();
  if (pending.step === 'company') return saveJob(user, { ...pending, companyName: value.slice(0, 120) }, reply);
  return saveJob(user, { ...pending, jobTitle: /^skip$/i.test(value) ? 'Untitled role' : value.slice(0, 160) }, reply);
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
export async function handleIncoming({ id, from, text }) {
  if (!id || !/^\d{6,15}$/.test(from || '') || !(await firstDelivery(id))) return;
  const reply = (body) => sendText(from, body);
  const msg = String(text || '').trim().slice(0, 3000);

  const code = /^(?:link|connect)\s+(JT-?[A-F0-9]{5}-?[A-F0-9]{5})\b/i.exec(msg);
  if (code) return link(from, code[1], reply);

  const user = await User.findOne({ 'whatsapp.phone': from }).select('+whatsapp.pending');
  if (!user) {
    const { totalHits } = await strangerReplies.increment(from);
    if (totalHits > 2) return undefined;
    return reply(`Hi! This number isn't connected to a Job Tracker account yet. Sign in at ${site()}/settings and use "Connect WhatsApp".`);
  }
  await User.updateOne({ _id: user._id }, { 'whatsapp.lastInboundAt': new Date() });
  if (!msg) return reply(`I can only read text messages.\n\n${HELP}`);

  const lower = msg.toLowerCase();
  const pending = user.whatsapp?.pending?.expiresAt > new Date() ? user.whatsapp.pending : null;
  const job = parseJobMessage(msg);
  if (job) return addJob(user, job, reply);
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
