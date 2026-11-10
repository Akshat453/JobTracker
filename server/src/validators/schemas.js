import { z } from 'zod';
import {
  STATUSES, EMPLOYMENT_TYPES, WORK_MODES, SOURCES, PRIORITIES, DIFFICULTIES, EMAIL_PROVIDERS,
  INTERVIEW_TYPES, INTERVIEW_STATUSES, INTERVIEW_RESULTS, REMINDER_TYPES, DOCUMENT_KINDS,
} from '../utils/constants.js';
import {
  optStr, optEmail, optUrl, optDate, optEnum, optNumber, optBool, objectId, optObjectId, stringList,
} from './common.js';

// ---------- Auth ----------
export const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name is too short').max(100),
  email: z.string().trim().toLowerCase().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
  inviteCode: z.string().trim().max(200).optional(),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Invalid email address'),
  password: z.string().min(1, 'Password is required').max(128),
});

export const profileSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  headline: optStr(160),
  location: optStr(120),
  phone: optStr(40),
  linkedinUrl: optUrl,
  skills: stringList,
  notificationPrefs: z
    .object({
      emailEnabled: optBool,
      notifyEmail: optEmail,
      interviewReminders: optBool,
      followUpReminders: optBool,
      deadlineReminders: optBool,
      leadTimeHours: z.coerce.number().int().min(1).max(168).optional(),
    })
    .partial()
    .optional(),
});

export const passwordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, 'Password must be at least 8 characters').max(128),
});

// ---------- Interviews ----------
const interviewFields = {
  roundName: z.string().trim().min(1, 'Round name is required').max(120),
  type: optEnum(INTERVIEW_TYPES),
  date: optDate,
  time: z.preprocess((v) => (v === '' ? null : v), z.string().regex(/^\d{2}:\d{2}$/, 'Time must be HH:mm').nullish()),
  durationMinutes: optNumber,
  location: optStr(300),
  meetingLink: optUrl,
  interviewerName: optStr(120),
  interviewerEmail: optEmail,
  status: optEnum(INTERVIEW_STATUSES),
  prepNotes: optStr(),
  questionsAsked: optStr(),
  feedback: optStr(),
  result: optEnum(INTERVIEW_RESULTS),
};

export const interviewCreateSchema = z.object({ application: objectId, ...interviewFields });
export const interviewUpdateSchema = z.object(interviewFields).partial();
/** Interview rounds embedded in the application form (may carry an existing _id). */
const nestedInterview = z.object({ _id: optObjectId, ...interviewFields });

// ---------- Applications ----------
const applicationFields = {
  company: z.object({
    name: z.string().trim().min(1, 'Company name is required').max(120),
    website: optUrl,
    location: optStr(120),
  }),
  jobTitle: z.string().trim().min(1, 'Job title is required').max(160),
  jobDescription: optStr(50000),
  jobPostingUrl: optUrl,
  jobId: optStr(80),
  department: optStr(120),
  industry: optStr(120),
  employmentType: optEnum(EMPLOYMENT_TYPES),
  workMode: optEnum(WORK_MODES),
  salary: z
    .object({
      min: optNumber,
      max: optNumber,
      currency: optStr(6),
      period: optEnum(['year', 'month', 'hour']),
    })
    .partial()
    .refine((s) => s.min == null || s.max == null || s.max >= s.min, {
      message: 'Maximum salary must be ≥ minimum', path: ['max'],
    })
    .optional(),
  experienceRequired: optStr(80),

  applicationDate: optDate,
  deadline: optDate,
  status: optEnum(STATUSES),
  source: optEnum(SOURCES),
  applicationLink: optUrl,
  lastUpdateDate: optDate,
  nextFollowUpDate: optDate,
  priority: optEnum(PRIORITIES),
  notes: optStr(),

  emailUsed: z
    .object({
      account: optObjectId,
      address: optEmail,
      provider: optEnum(EMAIL_PROVIDERS),
      confirmationReceived: optBool,
      confirmationDate: optDate,
      subject: optStr(300),
      recruiterEmail: optEmail,
      notes: optStr(),
    })
    .partial()
    .optional(),

  resume: optObjectId,
  documents: z.array(objectId).max(20).optional(),

  recruiter: z
    .object({ name: optStr(120), email: optEmail, linkedinUrl: optUrl, phone: optStr(40) })
    .partial()
    .optional(),
  referral: z
    .object({ received: optBool, name: optStr(120), contact: optStr(200), notes: optStr() })
    .partial()
    .optional(),

  personalNotes: optStr(),
  jdSnapshot: optStr(50000),
  skillsRequired: stringList,
  skillsMatched: stringList,
  difficulty: optEnum(DIFFICULTIES),
  tags: stringList,

  interviews: z.array(nestedInterview).max(30).optional(),
  statusNote: optStr(500),
};

export const applicationCreateSchema = z.object(applicationFields);
export const applicationUpdateSchema = z
  .object({ ...applicationFields, company: applicationFields.company.partial() })
  .partial();

export const statusUpdateSchema = z.object({
  status: z.enum(STATUSES, { errorMap: () => ({ message: 'Invalid status' }) }),
  note: optStr(500),
  changedAt: optDate,
});

export const applicationQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  status: z.string().optional(), // comma separated
  from: optDate,
  to: optDate,
  emailAccount: z.string().optional(),
  resume: z.string().optional(),
  employmentType: z.string().optional(),
  source: z.string().optional(),
  priority: z.string().optional(),
  tag: z.string().optional(),
  sort: z.enum(['newest', 'oldest', 'priority', 'followup', 'updated', 'company']).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

// ---------- Resumes / documents ----------
export const resumeMetaSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  version: optStr(40),
  category: optStr(60),
  description: optStr(1000),
  kind: optEnum(DOCUMENT_KINDS),
});
export const resumeUpdateSchema = resumeMetaSchema.partial().extend({ isArchived: optBool });

// ---------- Email accounts ----------
export const emailAccountSchema = z.object({
  email: z.string().trim().toLowerCase().email('Invalid email address'),
  provider: optEnum(EMAIL_PROVIDERS),
  label: optStr(60),
  notes: optStr(500),
  isDefault: optBool,
});
export const emailAccountUpdateSchema = emailAccountSchema.partial().extend({ isArchived: optBool });

// ---------- Reminders ----------
export const reminderCreateSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200),
  notes: optStr(1000),
  dueDate: z.coerce.date({ errorMap: () => ({ message: 'A valid due date is required' }) }),
  type: optEnum(REMINDER_TYPES),
  application: optObjectId,
});
export const reminderUpdateSchema = reminderCreateSchema.partial().extend({ completed: optBool });
