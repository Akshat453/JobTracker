import mongoose from 'mongoose';
import { EMAIL_PROVIDERS } from '../utils/constants.js';

const emailAccountSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    provider: { type: String, enum: EMAIL_PROVIDERS, default: 'Other' },
    label: { type: String, trim: true, maxlength: 60 }, // e.g. "Personal", "College"
    isDefault: { type: Boolean, default: false },
    notes: { type: String, trim: true, maxlength: 500 },
    isArchived: { type: Boolean, default: false },
    // Reserved for future Gmail/Outlook OAuth sync. Not required for core features.
    integration: {
      type: { type: String, enum: ['none', 'gmail_oauth', 'outlook_oauth'], default: 'none' },
      connected: { type: Boolean, default: false },
      lastSyncedAt: Date,
    },
  },
  { timestamps: true },
);

emailAccountSchema.index({ user: 1, email: 1 }, { unique: true });

export const EmailAccount = mongoose.model('EmailAccount', emailAccountSchema);
