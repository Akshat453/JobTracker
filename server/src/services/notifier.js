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

      const items = relevant.map((r) => ({
        title: r.title,
        when: formatWhen(r.dueDate, timeZone),
        overdue: r.dueDate < now,
        notes: r.notes,
        job: r.application?.company?.name ? `${r.application.company.name}${r.application.jobTitle ? ` · ${r.application.jobTitle}` : ''}` : '',
      }));
      const link = `${env.clientUrl}/reminders`;
      // A specific, calm subject ("Reminder: Prep call, Nov 12, 4:30 PM") reads like a personal
      // note; generic urgency ("N reminders need your attention") is a common spam pattern.
      const first = items[0];
      const subject = items.length === 1
        ? `Reminder: ${first.title}, ${first.when}`
        : `Reminders: ${first.title} and ${items.length - 1} more`;
      const textItems = items.map((i) => `- ${i.title}\n  ${i.overdue ? 'Was due' : 'Due'} ${i.when}${i.job ? `\n  ${i.job}` : ''}${i.notes ? `\n  ${i.notes}` : ''}`);
      const htmlItems = items.map((i) => `<li style="margin:0 0 12px"><strong>${escapeHtml(i.title)}</strong><br>${i.overdue ? 'Was due' : 'Due'} ${escapeHtml(i.when)}${i.job ? `<br><span style="color:#555">${escapeHtml(i.job)}</span>` : ''}${i.notes ? `<br><span style="color:#555">${escapeHtml(i.notes)}</span>` : ''}</li>`);
      const footer = 'You get this because reminder emails are turned on in your Job Tracker settings. You can turn them off there.';
      await sendMail({
        to: prefs.notifyEmail || user.email,
        subject,
        text: `Hi ${user.name},\n\nYour Job Tracker reminders:\n\n${textItems.join('\n\n')}\n\nSee all reminders: ${link}\n\n${footer}\n`,
        html: `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#222">`
          + `<p>Hi ${escapeHtml(user.name)},</p><p>Your Job Tracker reminders:</p><ul style="padding-left:20px">${htmlItems.join('')}</ul>`
          + `<p>See all reminders: <a href="${escapeHtml(link)}">${escapeHtml(link)}</a></p>`
          + `<p style="color:#777;font-size:12px">${escapeHtml(footer)}</p></body></html>`,
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
