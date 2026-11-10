import { Reminder } from '../models/index.js';

const CLOSED_STATUSES = ['rejected', 'withdrawn', 'accepted'];

async function upsertAuto(filter, { title, dueDate, notes }) {
  const existing = await Reminder.findOne(filter);
  if (!existing) {
    return Reminder.create({ ...filter, title, dueDate, notes, origin: 'auto' });
  }
  const dateChanged = +existing.dueDate !== +dueDate;
  existing.title = title;
  existing.dueDate = dueDate;
  if (dateChanged) { existing.completed = false; existing.completedAt = undefined; existing.notifiedAt = undefined; }
  return existing.save();
}

const removeOpenAuto = (filter) => Reminder.deleteMany({ ...filter, origin: 'auto', completed: false });

/**
 * Keeps auto-generated follow-up and deadline reminders in step with an application's dates/status.
 * Manual reminders are never touched.
 */
export async function syncApplicationReminders(app) {
  const base = { user: app.user, application: app._id, origin: 'auto' };
  const label = `${app.company.name} — ${app.jobTitle}`;
  const closed = CLOSED_STATUSES.includes(app.status);

  if (app.nextFollowUpDate && !closed) {
    await upsertAuto({ ...base, type: 'follow_up' }, { title: `Follow up: ${label}`, dueDate: app.nextFollowUpDate });
  } else {
    await removeOpenAuto({ user: app.user, application: app._id, type: 'follow_up' });
  }

  if (app.deadline && app.status === 'saved') {
    await upsertAuto({ ...base, type: 'deadline' }, { title: `Apply before deadline: ${label}`, dueDate: app.deadline });
  } else {
    await removeOpenAuto({ user: app.user, application: app._id, type: 'deadline' });
  }
}

export async function syncInterviewReminder(interview, app) {
  const filter = { user: interview.user, interview: interview._id, type: 'interview', origin: 'auto' };
  const active = interview.date && ['Scheduled', 'Rescheduled'].includes(interview.status);
  if (!active) return removeOpenAuto(filter);
  const company = app?.company?.name ? ` — ${app.company.name}` : '';
  return upsertAuto(
    { ...filter, application: interview.application },
    { title: `${interview.roundName} interview${company}`, dueDate: interview.date },
  );
}

export const removeInterviewReminders = (interviewId) => Reminder.deleteMany({ interview: interviewId });
