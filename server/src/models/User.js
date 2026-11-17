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
    timeZone: { type: String, trim: true, maxlength: 64 }, // IANA name from the browser, for times in emails
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
    // Connected WhatsApp number (digits, international format). Proven by the user sending a one-time
    // code from that number to the bot, so nobody can connect a number they don't control.
    whatsapp: {
      phone: { type: String, trim: true },
      linkedAt: Date,
      remindersEnabled: { type: Boolean, default: true },
      lastInboundAt: Date, // WhatsApp only allows free-form replies for 24 h after the user's last message
      pending: { type: mongoose.Schema.Types.Mixed, select: false }, // a job being added that still needs details
    },
    // The user turned the WhatsApp feature off: no connecting, no messages, card collapsed.
    whatsappOff: { type: Boolean, default: false },
    // One-time code for connecting WhatsApp: stored hashed, valid for a few minutes.
    whatsappLinkCode: { type: String, select: false },
    whatsappLinkExpiresAt: { type: Date, select: false },
    // Personal code friends type to send a friend request (e.g. "K7QM-3XPA"). Users can't be
    // searched or listed, so this (shared by the user themselves) is the only way to find someone.
    // Not selected by default, so it never appears in other responses by accident.
    friendCode: { type: String, unique: true, sparse: true, select: false },
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
  transform: (_doc, ret) => {
    // WhatsApp details are only returned by the WhatsApp settings endpoint (number masked).
    for (const k of ['password', 'passwordChangedAt', '__v', 'whatsapp', 'whatsappOff', 'whatsappLinkCode', 'whatsappLinkExpiresAt']) delete ret[k];
    return ret;
  },
});
// One account per WhatsApp number.
userSchema.index({ 'whatsapp.phone': 1 }, { unique: true, partialFilterExpression: { 'whatsapp.phone': { $type: 'string' } } });

export const User = mongoose.model('User', userSchema);
