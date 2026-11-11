import mongoose from 'mongoose';
import { DOCUMENT_KINDS } from '../utils/constants.js';

const storedFile = {
  originalName: { type: String, required: true },
  storedName: { type: String, required: true },
  mimeType: { type: String, required: true },
  size: { type: Number, required: true },
  storage: { type: String, enum: ['local'], default: 'local' },
};

/**
 * A stored document. `kind` distinguishes resumes from cover letters and other
 * supporting files so they share one document library.
 * Documents are never hard-deleted while referenced; they are archived instead.
 *
 * Versions: every version of a resume is its own document, so an application keeps pointing at
 * the exact version it was sent with. Versions of one resume share `family` (the first version's
 * id) and are numbered by `versionNumber`; `description` holds the notes on what changed.
 */
const resumeSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    kind: { type: String, enum: DOCUMENT_KINDS, default: 'resume' },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    version: { type: String, trim: true, maxlength: 40 },
    category: { type: String, trim: true, default: 'General' },
    description: { type: String, trim: true, maxlength: 1000 },
    file: storedFile,
    family: { type: mongoose.Schema.Types.ObjectId, ref: 'Resume' },
    versionNumber: { type: Number, default: 1, min: 1 },
    // The editable version of this file: an uploaded Word / LaTeX / Overleaf .zip file, or a link
    // (Overleaf, Google Docs…). A link always shows the latest content, not this version's.
    source: {
      type: new mongoose.Schema({
        file: { type: new mongoose.Schema(storedFile, { _id: false }) },
        url: { type: String, trim: true, maxlength: 2000 },
      }, { _id: false }),
      default: undefined,
    },
    isArchived: { type: Boolean, default: false, index: true },
    archivedAt: Date,
  },
  { timestamps: true },
);

resumeSchema.pre('validate', function setFamily() {
  if (!this.family) this.family = this._id;
});
resumeSchema.index({ user: 1, family: 1, versionNumber: -1 });

resumeSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.__v;
    delete ret.file?.storedName;
    delete ret.source?.file?.storedName;
    ret.family = ret.family || ret._id; // documents uploaded before versions existed
    ret.versionNumber = ret.versionNumber || 1;
    return ret;
  },
});

export const Resume = mongoose.model('Resume', resumeSchema);
