import mongoose from 'mongoose';
import { REMINDER_TYPES } from '../utils/constants.js';

const reminderSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    application: { type: mongoose.Schema.Types.ObjectId, ref: 'Application', index: true },
    interview: { type: mongoose.Schema.Types.ObjectId, ref: 'Interview' },
    type: { type: String, enum: REMINDER_TYPES, default: 'custom' },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    notes: { type: String, trim: true, maxlength: 1000 },
    dueDate: { type: Date, required: true },
    completed: { type: Boolean, default: false },
    completedAt: Date,
    // auto = generated from follow-up/deadline/interview dates and kept in sync
    origin: { type: String, enum: ['auto', 'manual'], default: 'manual' },
    notifiedAt: Date,
  },
  { timestamps: true },
);

reminderSchema.index({ user: 1, completed: 1, dueDate: 1 });

export const Reminder = mongoose.model('Reminder', reminderSchema);
