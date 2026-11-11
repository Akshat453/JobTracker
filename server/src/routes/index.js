import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { uploadDocument, uploadSource } from '../middleware/upload.js';
import { env } from '../config/env.js';
import * as S from '../validators/schemas.js';
import * as auth from '../controllers/authController.js';
import * as apps from '../controllers/applicationController.js';
import * as resumes from '../controllers/resumeController.js';
import * as emails from '../controllers/emailAccountController.js';
import * as interviews from '../controllers/interviewController.js';
import * as reminders from '../controllers/reminderController.js';
import * as analytics from '../controllers/analyticsController.js';
import * as shares from '../controllers/shareController.js';
import * as friends from '../controllers/friendController.js';
import { runReminderNotifications } from '../services/notifier.js';
import { sendMail, isMailConfigured } from '../services/mailer.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { MongoRateLimitStore } from '../utils/mongoRateLimitStore.js';
import { requireCronSecret } from '../middleware/cron.js';

const router = Router();

// `shared` limiters keep their counters in MongoDB so they hold across serverless instances.
const limiter = (name, windowMin, limit, message, { shared = false, ...extra } = {}) => rateLimit({
  windowMs: windowMin * 60 * 1000,
  limit: env.isTest ? 10_000 : limit,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { message } },
  ...(shared ? { store: new MongoRateLimitStore({ prefix: name }) } : {}),
  ...extra,
});
// Overall cap per IP, generous enough for normal use (per instance; a flood guard, not a security boundary).
const apiLimiter = limiter('api', 15, 1500, 'Too many requests, please slow down');
// Failed logins only: 10 per 15 minutes per IP.
const loginLimiter = limiter('login', 15, 10, 'Too many failed login attempts. Try again in 15 minutes.', { shared: true, skipSuccessfulRequests: true });
const registerLimiter = limiter('register', 60, 10, 'Too many sign-up attempts. Try again later.', { shared: true });
const passwordLimiter = limiter('password', 15, 10, 'Too many attempts. Try again in 15 minutes.', { shared: true });
const shareLimiter = limiter('share', 60, 30, 'Too many share links created. Try again later.', { shared: true });
const shareOpenLimiter = limiter('share-open', 15, 100, 'Too many requests, please slow down', { shared: true });
const friendRequestLimiter = limiter('friend-request', 60, 20, 'Too many friend requests. Try again later.', { shared: true });
const sendJobsLimiter = limiter('send-jobs', 60, 20, 'Too many jobs sent. Try again later.', { shared: true });
const mailLimiter = limiter('mail', 60, 5, 'Too many emails requested. Try again later.', { shared: true });

router.use(apiLimiter);
router.get('/health', (_req, res) => res.json({ ok: true }));

// ---- Scheduled jobs (Vercel Cron). Protected by CRON_SECRET, not user auth.
router.get('/cron/reminders', requireCronSecret, asyncHandler(async (_req, res) => {
  res.json({ digestsSent: await runReminderNotifications() });
}));

// ---- Auth & profile
router.get('/auth/config', auth.authConfig);
router.post('/auth/register', registerLimiter, validate(S.registerSchema), auth.register);
router.post('/auth/login', loginLimiter, validate(S.loginSchema), auth.login);
router.get('/auth/me', requireAuth, auth.me);
router.put('/auth/me', requireAuth, validate(S.profileSchema), auth.updateProfile);
router.put('/auth/password', requireAuth, passwordLimiter, validate(S.passwordSchema), auth.changePassword);

// Everything below requires authentication
router.use(requireAuth);

// ---- Applications
router.get('/applications', validate(S.applicationQuerySchema, 'query'), apps.listApplications);
router.get('/applications/export/csv', validate(S.applicationQuerySchema, 'query'), apps.exportCsv);
router.get('/applications/tags', apps.listTags);
router.post('/applications', validate(S.applicationCreateSchema), apps.createApp);
router.get('/applications/:id', apps.getApplication);
router.put('/applications/:id', validate(S.applicationUpdateSchema), apps.updateApp);
router.delete('/applications/:id', apps.deleteApp);
router.patch('/applications/:id/status', validate(S.statusUpdateSchema), apps.updateStatus);
router.post('/applications/:id/duplicate', apps.duplicateApp);
router.post('/applications/:id/notes', apps.addNote);
router.post('/applications/:id/share', shareLimiter, shares.createShare);

// ---- Shared jobs (link sharing between users; only signed-in users can open a link)
router.get('/shares/inbox', shares.inbox);
router.get('/shares/sent', shares.sent);
router.post('/shares/sent/:id/stop', shares.stopSharing);
router.post('/shares/inbox/accept-all', shares.acceptAllInbox);
router.post('/shares/inbox/:id/accept', shares.acceptInboxItem);
router.post('/shares/inbox/:id/decline', shares.declineInboxItem);
router.get('/shares/:token', shareOpenLimiter, shares.getShare);
router.post('/shares/:token/accept', shareOpenLimiter, shares.acceptShare);
router.post('/shares/:token/decline', shareOpenLimiter, shares.declineShare);

// ---- Friends
router.get('/friends', friends.listFriends);
router.get('/friends/summary', friends.summary);
router.post('/friends', friendRequestLimiter, validate(S.friendRequestSchema), friends.sendRequest);
router.post('/friend-code/regenerate', friendRequestLimiter, friends.regenerateCode);
router.post('/friends/send-jobs', sendJobsLimiter, validate(S.sendJobsSchema), friends.sendJobs);
router.post('/friends/:id/accept', friends.acceptRequest);
router.delete('/friends/:id', friends.removeFriendship);

// ---- Resumes & documents
router.get('/resumes', resumes.listResumes);
router.post('/resumes', uploadDocument, resumes.uploadResume);
router.get('/resumes/:id', resumes.getResume);
router.get('/resumes/:id/file', resumes.downloadResume);
router.post('/resumes/:id/versions', uploadDocument, resumes.createVersion);
router.get('/resumes/:id/source', resumes.downloadSource);
router.put('/resumes/:id/source', uploadSource, resumes.setSource);
router.delete('/resumes/:id/source', resumes.removeSource);
router.put('/resumes/:id', validate(S.resumeUpdateSchema), resumes.updateResume);
router.delete('/resumes/:id', resumes.deleteResume);

// ---- Email accounts
router.get('/email-accounts', emails.listEmailAccounts);
router.post('/email-accounts', validate(S.emailAccountSchema), emails.createEmailAccount);
router.put('/email-accounts/:id', validate(S.emailAccountUpdateSchema), emails.updateEmailAccount);
router.delete('/email-accounts/:id', emails.deleteEmailAccount);

// ---- Interviews
router.get('/interviews', interviews.listInterviews);
router.post('/interviews', validate(S.interviewCreateSchema), interviews.createInterview);
router.put('/interviews/:id', validate(S.interviewUpdateSchema), interviews.updateInterview);
router.delete('/interviews/:id', interviews.deleteInterview);

// ---- Reminders
router.get('/reminders', reminders.listReminders);
router.post('/reminders', validate(S.reminderCreateSchema), reminders.createReminder);
router.put('/reminders/:id', validate(S.reminderUpdateSchema), reminders.updateReminder);
router.delete('/reminders/:id', reminders.deleteReminder);

// ---- Analytics & reports
router.get('/analytics/overview', analytics.overview);
router.get('/analytics/applications', analytics.applications);
router.get('/analytics/resumes', analytics.resumes);
router.get('/analytics/sources', analytics.sources);
router.get('/analytics/report.pdf', analytics.pdfReport);

// ---- Notifications
router.post('/notifications/test', mailLimiter, asyncHandler(async (req, res) => {
  const to = req.user.notificationPrefs?.notifyEmail || req.user.email;
  await sendMail({ to, subject: 'Job Tracker test notification', text: 'Email notifications are working.' });
  res.json({ message: isMailConfigured() ? `Test email sent to ${to}` : 'SMTP is not configured — the email was logged on the server instead.', smtpConfigured: isMailConfigured() });
}));

export default router;
