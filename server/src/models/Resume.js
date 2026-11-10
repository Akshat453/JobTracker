import mongoose from 'mongoose';
import { DOCUMENT_KINDS } from '../utils/constants.js';

/**
 * A stored document. `kind` distinguishes resumes from cover letters and other
 * supporting files so they share one document library.
 * Documents are never hard-deleted while referenced; they are archived instead.
 */
const resumeSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    kind: { type: String, enum: DOCUMENT_KINDS, default: 'resume' },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    version: { type: String, trim: true, maxlength: 40 },
    category: { type: String, trim: true, default: 'General' },
    description: { type: String, trim: true, maxlength: 1000 },
    file: {
      originalName: { type: String, required: true },
      storedName: { type: String, required: true },
      mimeType: { type: String, required: true },
      size: { type: Number, required: true },
      storage: { type: String, enum: ['local'], default: 'local' },
    },
    isArchived: { type: Boolean, default: false, index: true },
    archivedAt: Date,
  },
  { timestamps: true },
);

resumeSchema.set('toJSON', {
  transform: (_doc, ret) => { delete ret.__v; delete ret.file?.storedName; return ret; },
});

export const Resume = mongoose.model('Resume', resumeSchema);
