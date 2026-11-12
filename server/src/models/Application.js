import mongoose from 'mongoose';
import {
  STATUSES, EMPLOYMENT_TYPES, WORK_MODES, SOURCES, PRIORITIES, PRIORITY_RANK, DIFFICULTIES, EMAIL_PROVIDERS,
} from '../utils/constants.js';

const { ObjectId } = mongoose.Schema.Types;

const statusHistorySchema = new mongoose.Schema(
  {
    status: { type: String, enum: STATUSES, required: true },
    from: { type: String, enum: [...STATUSES, null], default: null },
    changedAt: { type: Date, default: Date.now },
    note: { type: String, trim: true, maxlength: 500 },
    // Set when the change was made automatically by adding this interview, so deleting the
    // interview can undo it.
    interview: { type: ObjectId, ref: 'Interview' },
  },
  { _id: true },
);

const activitySchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['created', 'updated', 'status_changed', 'interview_added', 'interview_updated', 'interview_removed',
        'reminder_added', 'reminder_completed', 'resume_attached', 'note', 'duplicated', 'status_reverted'],
      required: true,
    },
    message: { type: String, required: true },
    at: { type: Date, default: Date.now },
    meta: mongoose.Schema.Types.Mixed,
  },
  { _id: true },
);

const applicationSchema = new mongoose.Schema(
  {
    user: { type: ObjectId, ref: 'User', required: true, index: true },

    // A. Company & job
    company: {
      name: { type: String, required: true, trim: true, maxlength: 120 },
      website: { type: String, trim: true },
      location: { type: String, trim: true },
    },
    jobTitle: { type: String, required: true, trim: true, maxlength: 160 },
    jobDescription: { type: String, trim: true },
    jobPostingUrl: { type: String, trim: true },
    jobId: { type: String, trim: true },
    department: { type: String, trim: true },
    industry: { type: String, trim: true },
    employmentType: { type: String, enum: EMPLOYMENT_TYPES, default: 'Full-time' },
    workMode: { type: String, enum: WORK_MODES },
    salary: {
      min: { type: Number, min: 0 },
      max: { type: Number, min: 0 },
      currency: { type: String, trim: true, uppercase: true, default: 'INR' },
      period: { type: String, enum: ['year', 'month', 'hour'], default: 'year' },
    },
    experienceRequired: { type: String, trim: true },

    // B. Application details
    applicationDate: { type: Date, default: Date.now, index: true },
    deadline: Date,
    status: { type: String, enum: STATUSES, default: 'applied', index: true },
    source: { type: String, enum: SOURCES, default: 'LinkedIn' },
    applicationLink: { type: String, trim: true },
    lastUpdateDate: { type: Date, default: Date.now },
    nextFollowUpDate: Date,
    priority: { type: String, enum: PRIORITIES, default: 'Medium' },
    priorityRank: { type: Number, default: 2 },
    notes: { type: String, trim: true },

    // C. Email account used
    emailUsed: {
      account: { type: ObjectId, ref: 'EmailAccount' },
      address: { type: String, trim: true, lowercase: true }, // snapshot, survives account edits
      provider: { type: String, enum: EMAIL_PROVIDERS },
      confirmationReceived: { type: Boolean, default: false },
      confirmationDate: Date,
      subject: { type: String, trim: true },
      recruiterEmail: { type: String, trim: true, lowercase: true },
      notes: { type: String, trim: true },
    },

    // D. Resume & documents
    resume: { type: ObjectId, ref: 'Resume' },
    // Snapshot of the exact resume version submitted (kept even if the resume is archived/renamed).
    resumeSnapshot: {
      name: String,
      version: String,
      category: String,
      originalName: String,
      attachedAt: Date,
    },
    documents: [{ type: ObjectId, ref: 'Resume' }], // cover letters & supporting docs

    // E. Recruiter & referral
    recruiter: {
      name: { type: String, trim: true },
      email: { type: String, trim: true, lowercase: true },
      linkedinUrl: { type: String, trim: true },
      phone: { type: String, trim: true },
    },
    referral: {
      received: { type: Boolean, default: false },
      name: { type: String, trim: true },
      contact: { type: String, trim: true },
      notes: { type: String, trim: true },
    },

    // G. Additional
    personalNotes: { type: String, trim: true },
    jdSnapshot: { type: String, trim: true },
    skillsRequired: [{ type: String, trim: true }],
    skillsMatched: [{ type: String, trim: true }],
    difficulty: { type: String, enum: DIFFICULTIES },
    tags: [{ type: String, trim: true, lowercase: true }],

    statusHistory: [statusHistorySchema],
    activity: [activitySchema],
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } },
);

applicationSchema.virtual('interviews', {
  ref: 'Interview', localField: '_id', foreignField: 'application', options: { sort: { date: 1 } },
});
applicationSchema.virtual('reminders', {
  ref: 'Reminder', localField: '_id', foreignField: 'application', options: { sort: { dueDate: 1 } },
});

applicationSchema.pre('save', function syncPriorityRank(next) {
  this.priorityRank = PRIORITY_RANK[this.priority] ?? 2;
  next();
});

applicationSchema.index({ user: 1, updatedAt: -1 });
applicationSchema.index({ user: 1, 'company.name': 1, jobTitle: 1 });

applicationSchema.methods.log = function log(type, message, meta) {
  this.activity.push({ type, message, meta, at: new Date() });
};

export const Application = mongoose.model('Application', applicationSchema);
