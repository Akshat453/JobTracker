import mongoose from 'mongoose';

/**
 * The user's resume, section by section, as plain text to copy into job-board forms (Workday etc.).
 * One per user. Dates are "YYYY" or "YYYY-MM". Descriptions hold one bullet per line.
 */
const str = (max) => ({ type: String, trim: true, maxlength: max, default: '' });
const date = { type: String, match: /^$|^\d{4}(-(0[1-9]|1[0-2]))?$/, default: '' };
const opts = { _id: true };

const experienceSchema = new mongoose.Schema({
  jobTitle: str(160), company: str(160), location: str(160), from: date, to: date,
  current: { type: Boolean, default: false }, description: str(6000),
}, opts);
const educationSchema = new mongoose.Schema({
  school: str(200), degree: str(160), field: str(160), location: str(160), from: date, to: date, grade: str(60), description: str(4000),
}, opts);
const projectSchema = new mongoose.Schema({
  name: str(160), tech: str(400), link: str(500), from: date, to: date, description: str(6000),
}, opts);
const skillSchema = new mongoose.Schema({ category: str(100), items: str(2000) }, opts);
const extraSchema = new mongoose.Schema({ title: str(100), content: str(6000) }, opts);

const resumeProfileSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  contact: {
    fullName: str(120), email: str(200), phone: str(40), location: str(160),
    linkedin: str(500), github: str(500), portfolio: str(500), other: str(500),
  },
  summary: str(4000),
  experience: [experienceSchema],
  education: [educationSchema],
  projects: [projectSchema],
  skills: [skillSchema],
  extras: [extraSchema],
}, { timestamps: true });

resumeProfileSchema.set('toJSON', {
  transform: (_doc, ret) => { delete ret.user; delete ret.__v; return ret; },
});

export const ResumeProfile = mongoose.model('ResumeProfile', resumeProfileSchema);
