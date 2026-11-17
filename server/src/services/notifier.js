import mongoose from 'mongoose';
import { Reminder, User } from '../models/index.js';
import { env } from '../config/env.js';
import { sendMail, isMailConfigured } from './mailer.js';
import { sendText, insideFreeWindow, isWhatsAppConfigured } from './whatsapp/client.js';

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

const fmtShort = (date, timeZone) => {
  try { return date.toLocaleString('en-US', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone }); } catch { return date.toISOString(); }
};

/**
 * Sends due reminders on WhatsApp, for free only: a reminder goes on WhatsApp only while the user
 * messaged the bot less than ~24 hours ago (see client.js). Otherwise it is not sent on WhatsApp at all,
 * now or later; email reminders (if turned on) cover it.
 *
 * Reminders set from WhatsApp and other custom ones go at their time; interview, follow-up and deadline
 * reminders go within the user's lead time, like the emails. Each reminder is considered once
 * (whatsappedAt), whether it was sent or skipped. Returns the number of users messaged.
 */
export async function runWhatsAppReminders(now = new Date(), { userId } = {}) {
  if (!isWhatsAppConfigured()) return 0;
  const users = await User.find({ 'whatsapp.phone': { $type: 'string' }, 'whatsapp.remindersEnabled': { $ne: false }, ...(userId ? { _id: userId } : {}) });
  let sent = 0;
  for (const user of users) {
    try {
      const prefs = user.notificationPrefs || {};
      const timeZone = prefs.timeZone || env.defaultTimeZone;
      const horizon = new Date(now.getTime() + (prefs.leadTimeHours || 24) * 3_600_000);
      const candidates = await Reminder.find({ user: user._id, completed: false, whatsappedAt: null, dueDate: { $lte: horizon } })
        .populate('application', 'company.name jobTitle').sort({ dueDate: 1 });
      const due = candidates.filter((r) => (r.type === 'custom' ? r.dueDate <= now : prefs[TYPE_PREF[r.type]] !== false));
      if (!due.length) continue;

      const lastInboundAt = user.whatsapp.lastInboundAt;
      if (insideFreeWindow(lastInboundAt, now)) {
        const line = (r) => `${r.title} (${r.dueDate < now ? 'was due' : 'due'} ${fmtShort(r.dueDate, timeZone)})${r.application?.company?.name ? ` · ${r.application.company.name}` : ''}`;
        await sendText(user.whatsapp.phone, `⏰ ${due.length === 1 ? 'Reminder' : 'Reminders'}:\n\n${due.map((r) => `• ${line(r)}`).join('\n')}\n\nReply *reminders* to see all.`, { lastInboundAt });
        sent += 1;
      }
      // Sent, or skipped because the free window had closed: either way never sent on WhatsApp later.
      await Reminder.updateMany({ _id: { $in: due.map((r) => r._id) } }, { whatsappedAt: now });
    } catch (e) {
      console.error(`[notifier] WhatsApp reminders for user ${user._id} failed: ${e.message}`);
    }
  }
  return sent;
}

/** Email digests and WhatsApp reminders. */
export async function runAllNotifications(now = new Date()) {
  const emails = await runReminderNotifications(now);
  const whatsapp = await runWhatsAppReminders(now);
  return { emails, whatsapp };
}

/**
 * Runs the digest for everyone, but at most once per `everyMs` across all server instances. Called
 * in the background on ordinary API traffic, so emails also go out on time when the external hourly
 * trigger is late or skipped. The claim is one atomic update on a small `jobruns` document, so two
 * instances never both run it.
 */
export async function maybeRunReminderNotifications({ now = new Date(), everyMs = 10 * 60_000 } = {}) {
  if (!isMailConfigured() && !isWhatsAppConfigured() && !env.isTest) return false;
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
  await runAllNotifications(now);
  return true;
}

export function startReminderScheduler() {
  if (!env.reminderIntervalMin || env.isTest) return null;
  const tick = () => runAllNotifications().catch((e) => console.error('[notifier]', e.message));
  setTimeout(tick, 10_000);
  return setInterval(tick, env.reminderIntervalMin * 60_000);
}
