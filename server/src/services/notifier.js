import mongoose from 'mongoose';
import { Reminder, User } from '../models/index.js';
import { env } from '../config/env.js';
import { sendMail, isMailConfigured } from './mailer.js';

const TYPE_PREF = { interview: 'interviewReminders', follow_up: 'followUpReminders', deadline: 'deadlineReminders', custom: 'followUpReminders' };

const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function formatWhen(date, timeZone) {
  const opts = { dateStyle: 'medium', timeStyle: 'short', timeZone };
  try { return date.toLocaleString('en-US', opts); } catch { return date.toLocaleString('en-US', { ...opts, timeZone: 'UTC' }) + ' UTC'; }
}

let warnedNoSmtp = false;

/**
 * Sends one digest email per user listing reminders due within their lead time that haven't been
 * emailed yet. Safe to run repeatedly (e.g. hourly).
 *
 * Reminders are only marked as emailed after the email was really handed to the SMTP server. Without
 * SMTP settings nothing is sent and nothing is marked, so the reminders still go out once SMTP is set
 * up. (Tests use the built-in JSON transport instead.)
 */
export async function runReminderNotifications(now = new Date(), { userId } = {}) {
  if (!isMailConfigured() && !env.isTest) {
    if (!warnedNoSmtp) console.warn('[notifier] SMTP is not configured: reminder emails are not being sent.');
    warnedNoSmtp = true;
    return 0;
  }

  const users = await User.find({ 'notificationPrefs.emailEnabled': true, ...(userId ? { _id: userId } : {}) });
  let sent = 0;
  for (const user of users) {
    try {
      const prefs = user.notificationPrefs;
      const timeZone = prefs.timeZone || env.defaultTimeZone;
      const horizon = new Date(now.getTime() + (prefs.leadTimeHours || 24) * 3_600_000);
      const due = await Reminder.find({ user: user._id, completed: false, emailedAt: null, dueDate: { $lte: horizon } })
        .populate('application', 'company.name jobTitle')
        .sort({ dueDate: 1 });
      const relevant = due.filter((r) => prefs[TYPE_PREF[r.type]] !== false);
      if (!relevant.length) continue;

      const lines = relevant.map((r) => `${r.title} — ${formatWhen(r.dueDate, timeZone)}${r.dueDate < now ? ' (overdue)' : ''}`);
      const link = `${env.clientUrl}/reminders`;
      await sendMail({
        to: prefs.notifyEmail || user.email,
        subject: `Job Tracker: ${relevant.length} reminder${relevant.length > 1 ? 's' : ''} need your attention`,
        text: `Hi ${user.name},\n\nHere is what's coming up:\n\n${lines.map((l) => `• ${l}`).join('\n')}\n\nOpen ${link} to manage them.`,
        html: `<p>Hi ${escapeHtml(user.name)},</p><p>Here is what's coming up:</p><ul>${lines
          .map((l) => `<li>${escapeHtml(l)}</li>`)
          .join('')}</ul><p><a href="${escapeHtml(link)}">Manage reminders</a></p>`,
      });
      await Reminder.updateMany({ _id: { $in: relevant.map((r) => r._id) } }, { emailedAt: now });
      sent += 1;
    } catch (e) {
      // One bad address or SMTP hiccup shouldn't stop everyone else's digest; it's retried next run.
      console.error(`[notifier] digest for user ${user._id} failed: ${e.message}`);
    }
  }
  return sent;
}

/**
 * Runs the digest for everyone, but at most once per `everyMs` across all server instances. Called
 * in the background on ordinary API traffic, so emails also go out on time when the external hourly
 * trigger is late or skipped. The claim is one atomic update on a small `jobruns` document, so two
 * instances never both run it.
 */
export async function maybeRunReminderNotifications({ now = new Date(), everyMs = 10 * 60_000 } = {}) {
  if (!isMailConfigured() && !env.isTest) return false;
  const runs = mongoose.connection.db.collection('jobruns');
  try {
    await runs.updateOne(
      { _id: 'reminders', $or: [{ lastRunAt: { $lt: new Date(now.getTime() - everyMs) } }, { lastRunAt: { $exists: false } }] },
      { $set: { lastRunAt: now } },
      { upsert: true },
    );
  } catch (e) {
    if (e.code === 11000) return false; // another request ran it recently
    throw e;
  }
  await runReminderNotifications(now);
  return true;
}

export function startReminderScheduler() {
  if (!env.reminderIntervalMin || env.isTest) return null;
  const tick = () => runReminderNotifications().catch((e) => console.error('[notifier]', e.message));
  setTimeout(tick, 10_000);
  return setInterval(tick, env.reminderIntervalMin * 60_000);
}
