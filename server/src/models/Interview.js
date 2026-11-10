import mongoose from 'mongoose';
import { INTERVIEW_TYPES, INTERVIEW_STATUSES, INTERVIEW_RESULTS } from '../utils/constants.js';

const interviewSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    application: { type: mongoose.Schema.Types.ObjectId, ref: 'Application', required: true, index: true },
    roundName: { type: String, required: true, trim: true, maxlength: 120 },
    type: { type: String, enum: INTERVIEW_TYPES, default: 'Technical' },
    date: Date, // date + time combined
    time: { type: String, trim: true }, // "HH:mm" as entered, for display
    durationMinutes: { type: Number, min: 0 },
    location: { type: String, trim: true },
    meetingLink: { type: String, trim: true },
    interviewerName: { type: String, trim: true },
    interviewerEmail: { type: String, trim: true, lowercase: true },
    status: { type: String, enum: INTERVIEW_STATUSES, default: 'Scheduled' },
    prepNotes: { type: String, trim: true },
    questionsAsked: { type: String, trim: true },
    feedback: { type: String, trim: true },
    result: { type: String, enum: INTERVIEW_RESULTS, default: 'Pending' },
  },
  { timestamps: true },
);

interviewSchema.index({ user: 1, date: 1 });

export const Interview = mongoose.model('Interview', interviewSchema);
