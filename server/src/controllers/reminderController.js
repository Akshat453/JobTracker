import { Application, Reminder } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { assertObjectId, startOfDay, endOfDay, addDays } from '../utils/helpers.js';
import { findWithApplication } from '../utils/withApplication.js';

async function loadOwned(req) {
  assertObjectId(req.params.id);
  const r = await Reminder.findOne({ _id: req.params.id, user: req.user._id });
  if (!r) throw ApiError.notFound('Reminder not found');
  return r;
}

async function assertAppOwned(userId, appId) {
  if (!appId) return null;
  const app = await Application.findOne({ _id: appId, user: userId });
  if (!app) throw ApiError.badRequest('Linked application was not found');
  return app;
}

export const listReminders = asyncHandler(async (req, res) => {
  const filter = { user: req.user._id };
  const now = new Date();
  switch (req.query.view) {
    case 'overdue': Object.assign(filter, { completed: false, dueDate: { $lt: startOfDay(now) } }); break;
    case 'today': Object.assign(filter, { completed: false, dueDate: { $gte: startOfDay(now), $lte: endOfDay(now) } }); break;
    case 'upcoming': Object.assign(filter, { completed: false, dueDate: { $gte: startOfDay(now) } }); break;
    case 'week': Object.assign(filter, { completed: false, dueDate: { $lte: endOfDay(addDays(now, 7)) } }); break;
    case 'completed': filter.completed = true; break;
    case 'open': filter.completed = false; break;
    default: break;
  }
  if (req.query.type) filter.type = { $in: String(req.query.type).split(',') };
  if (req.query.application) { assertObjectId(req.query.application, 'application'); filter.application = req.query.application; }

  // The list and the three counts are independent: fetch them in parallel (one round trip).
  const user = req.user._id;
  const [items, overdue, today, upcoming] = await Promise.all([
    findWithApplication(Reminder, filter, { sort: { completed: 1, dueDate: req.query.view === 'completed' ? -1 : 1 }, limit: 500 }),
    Reminder.countDocuments({ user, completed: false, dueDate: { $lt: startOfDay(now) } }),
    Reminder.countDocuments({ user, completed: false, dueDate: { $gte: startOfDay(now), $lte: endOfDay(now) } }),
    Reminder.countDocuments({ user, completed: false, dueDate: { $gte: startOfDay(now) } }),
  ]);
  res.json({ items, counts: { overdue, today, upcoming } });
});

export const createReminder = asyncHandler(async (req, res) => {
  const app = await assertAppOwned(req.user._id, req.body.application);
  const reminder = await Reminder.create({ ...req.body, type: req.body.type || 'custom', user: req.user._id, origin: 'manual' });
  if (app) {
    app.log('reminder_added', `Reminder added: ${reminder.title}`);
    await app.save();
  }
  res.status(201).json({ reminder });
});

export const updateReminder = asyncHandler(async (req, res) => {
  const reminder = await loadOwned(req);
  const { completed, ...rest } = req.body;
  if ('application' in rest) await assertAppOwned(req.user._id, rest.application);
  for (const [k, v] of Object.entries(rest)) if (v !== undefined) reminder.set(k, v);
  if (rest.dueDate) reminder.notifiedAt = undefined;
  if (completed !== undefined && completed !== reminder.completed) {
    reminder.completed = completed;
    reminder.completedAt = completed ? new Date() : undefined;
    if (completed && reminder.application) {
      await Application.updateOne(
        { _id: reminder.application, user: req.user._id },
        { $push: { activity: { type: 'reminder_completed', message: `Reminder completed: ${reminder.title}`, at: new Date() } } },
      );
    }
  }
  await reminder.save();
  res.json({ reminder });
});

export const deleteReminder = asyncHandler(async (req, res) => {
  const reminder = await loadOwned(req);
  await reminder.deleteOne();
  res.json({ message: 'Reminder deleted' });
});
