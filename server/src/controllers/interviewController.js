import { Application, Interview } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { assertObjectId, startOfDay } from '../utils/helpers.js';
import { combineDateTime, changeStatus } from '../services/applicationService.js';
import { syncInterviewReminder, removeInterviewReminders } from '../services/reminderSync.js';

const PRE_INTERVIEW = ['saved', 'applied', 'assessment_pending', 'assessment_completed', 'on_hold'];

async function loadOwned(req) {
  assertObjectId(req.params.id);
  const iv = await Interview.findOne({ _id: req.params.id, user: req.user._id });
  if (!iv) throw ApiError.notFound('Interview not found');
  return iv;
}

export const listInterviews = asyncHandler(async (req, res) => {
  const filter = { user: req.user._id };
  if (req.query.application) { assertObjectId(req.query.application, 'application'); filter.application = req.query.application; }
  if (req.query.status) filter.status = { $in: String(req.query.status).split(',') };
  if (req.query.when === 'upcoming') filter.date = { $gte: startOfDay() };
  if (req.query.when === 'past') filter.date = { $lt: startOfDay() };
  const items = await Interview.find(filter)
    .sort({ date: req.query.when === 'past' ? -1 : 1 })
    .populate('application', 'company.name jobTitle status')
    .lean();
  res.json({ items });
});

export const createInterview = asyncHandler(async (req, res) => {
  const app = await Application.findOne({ _id: req.body.application, user: req.user._id });
  if (!app) throw ApiError.notFound('Application not found');
  const data = { ...req.body, date: combineDateTime(req.body.date, req.body.time) };
  const iv = await Interview.create({ ...data, user: req.user._id });

  app.log('interview_added', `Interview "${iv.roundName}" added`);
  // Move the application forward automatically when its first interview/assessment is scheduled.
  const isAssessment = ['Online Assessment', 'Assignment'].includes(iv.type);
  if (isAssessment && ['saved', 'applied'].includes(app.status)) {
    changeStatus(app, 'assessment_pending', 'Auto-updated: assessment added');
  } else if (!isAssessment && PRE_INTERVIEW.includes(app.status)) {
    changeStatus(app, 'interview_scheduled', 'Auto-updated: interview added');
  }
  await app.save();
  await syncInterviewReminder(iv, app);
  res.status(201).json({ interview: iv, applicationStatus: app.status });
});

export const updateInterview = asyncHandler(async (req, res) => {
  const iv = await loadOwned(req);
  const data = { ...req.body };
  if ('date' in data || 'time' in data) data.date = combineDateTime(data.date ?? iv.date, data.time ?? iv.time);
  iv.set(data);
  await iv.save();
  const app = await Application.findById(iv.application);
  if (app) {
    app.log('interview_updated', `Interview "${iv.roundName}" updated${req.body.status ? ` (${iv.status})` : ''}`);
    await app.save();
  }
  await syncInterviewReminder(iv, app);
  res.json({ interview: iv });
});

export const deleteInterview = asyncHandler(async (req, res) => {
  const iv = await loadOwned(req);
  await removeInterviewReminders(iv._id);
  await iv.deleteOne();
  await Application.updateOne(
    { _id: iv.application },
    { $push: { activity: { type: 'interview_removed', message: `Interview "${iv.roundName}" removed`, at: new Date() } } },
  );
  res.json({ message: 'Interview deleted' });
});
