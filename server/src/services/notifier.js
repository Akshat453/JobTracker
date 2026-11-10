import { Reminder, User } from '../models/index.js';
import { env } from '../config/env.js';
import { sendMail } from './mailer.js';

const TYPE_PREF = { interview: 'interviewReminders', follow_up: 'followUpReminders', deadline: 'deadlineReminders', custom: 'followUpReminders' };

/**
 * Sends one digest email per user listing reminders due within their lead time
 * that have not been notified yet. Safe to run repeatedly.
 */
export async function runReminderNotifications(now = new Date(), { userId } = {}) {
  const users = await User.find({ 'notificationPrefs.emailEnabled': true, ...(userId ? { _id: userId } : {}) });
  let sent = 0;
  for (const user of users) {
    const prefs = user.notificationPrefs;
    const horizon = new Date(now.getTime() + (prefs.leadTimeHours || 24) * 3_600_000);
    const due = await Reminder.find({ user: user._id, completed: false, notifiedAt: null, dueDate: { $lte: horizon } })
      .populate('application', 'company.name jobTitle')
      .sort({ dueDate: 1 });
    const relevant = due.filter((r) => prefs[TYPE_PREF[r.type]] !== false);
    if (!relevant.length) continue;

    const lines = relevant.map((r) => {
      const when = r.dueDate.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
      const overdue = r.dueDate < now ? ' (overdue)' : '';
      return `• ${r.title} — ${when}${overdue}`;
    });
    await sendMail({
      to: prefs.notifyEmail || user.email,
      subject: `Job Tracker: ${relevant.length} reminder${relevant.length > 1 ? 's' : ''} need your attention`,
      text: `Hi ${user.name},\n\nHere is what's coming up:\n\n${lines.join('\n')}\n\nOpen ${env.clientUrl}/reminders to manage them.`,
      html: `<p>Hi ${user.name},</p><p>Here is what's coming up:</p><ul>${relevant
        .map((r, i) => `<li>${lines[i].slice(2).replace(/</g, '&lt;')}</li>`)
        .join('')}</ul><p><a href="${env.clientUrl}/reminders">Manage reminders</a></p>`,
    });
    await Reminder.updateMany({ _id: { $in: relevant.map((r) => r._id) } }, { notifiedAt: now });
    sent += 1;
  }
  return sent;
}

export function startReminderScheduler() {
  if (!env.reminderIntervalMin || env.isTest) return null;
  const tick = () => runReminderNotifications().catch((e) => console.error('[notifier]', e.message));
  setTimeout(tick, 10_000);
  return setInterval(tick, env.reminderIntervalMin * 60_000);
}
