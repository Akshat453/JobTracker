import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const notificationPrefsSchema = new mongoose.Schema(
  {
    emailEnabled: { type: Boolean, default: false },
    notifyEmail: { type: String, trim: true, lowercase: true }, // falls back to account email
    interviewReminders: { type: Boolean, default: true },
    followUpReminders: { type: Boolean, default: true },
    deadlineReminders: { type: Boolean, default: true },
    leadTimeHours: { type: Number, default: 24, min: 1, max: 168 },
  },
  { _id: false },
);

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    password: { type: String, required: true, minlength: 8, select: false },
    passwordChangedAt: { type: Date }, // tokens issued before this are rejected
    headline: { type: String, trim: true, maxlength: 160 },
    location: { type: String, trim: true, maxlength: 120 },
    phone: { type: String, trim: true, maxlength: 40 },
    linkedinUrl: { type: String, trim: true },
    skills: [{ type: String, trim: true }],
    notificationPrefs: { type: notificationPrefsSchema, default: () => ({}) },
  },
  { timestamps: true },
);

userSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  if (!this.isNew) this.passwordChangedAt = new Date();
  next();
});

userSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};

userSchema.set('toJSON', {
  transform: (_doc, ret) => { delete ret.password; delete ret.passwordChangedAt; delete ret.__v; return ret; },
});

export const User = mongoose.model('User', userSchema);
