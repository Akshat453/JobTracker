import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { User, EmailAccount } from '../models/index.js';
import { env } from '../config/env.js';
import { signToken } from '../middleware/auth.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const digest = (s) => crypto.createHash('sha256').update(String(s)).digest();
const inviteOk = (code) => !env.registrationCode || (code != null && crypto.timingSafeEqual(digest(code), digest(env.registrationCode)));

// Compared against when the email doesn't exist, so response time doesn't reveal which emails have accounts.
let dummyHash;
const fakeCompare = async (pw) => bcrypt.compare(pw, (dummyHash ??= await bcrypt.hash('not-a-real-password', 12)));

export const authConfig = (_req, res) => res.json({ inviteRequired: Boolean(env.registrationCode), maxUploadMb: env.maxUploadMb });

export const register = asyncHandler(async (req, res) => {
  const { name, email, password, inviteCode } = req.body;
  if (!inviteOk(inviteCode)) throw ApiError.forbidden('A valid invite code is required to sign up');
  if (await User.exists({ email })) throw ApiError.conflict('An account with this email already exists');
  const user = await User.create({ name, email, password });
  // The sign-up address is a sensible first "email used to apply".
  await EmailAccount.create({ user: user._id, email, isDefault: true, label: 'Primary', provider: guessProvider(email) });
  res.status(201).json({ token: signToken(user._id), user });
});

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email }).select('+password');
  const valid = user ? await user.comparePassword(password) : await fakeCompare(password) && false;
  if (!valid) throw ApiError.unauthorized('Invalid email or password');
  res.json({ token: signToken(user._id), user });
});

export const me = asyncHandler(async (req, res) => res.json({ user: req.user }));

export const updateProfile = asyncHandler(async (req, res) => {
  const { notificationPrefs, ...rest } = req.body;
  for (const [k, v] of Object.entries(rest)) if (v !== undefined) req.user.set(k, v);
  if (notificationPrefs) {
    for (const [k, v] of Object.entries(notificationPrefs)) if (v !== undefined) req.user.set(`notificationPrefs.${k}`, v);
  }
  await req.user.save();
  res.json({ user: req.user });
});

export const changePassword = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select('+password');
  if (!(await user.comparePassword(req.body.currentPassword))) throw ApiError.badRequest('Current password is incorrect');
  user.password = req.body.newPassword;
  await user.save();
  // Other sessions are now invalid; hand this one a fresh token so it stays signed in.
  res.json({ message: 'Password updated', token: signToken(user._id) });
});

export function guessProvider(email) {
  const domain = email.split('@')[1] || '';
  if (/gmail\.com$|googlemail\.com$/.test(domain)) return 'Gmail';
  if (/outlook\.|hotmail\.|live\.com$|msn\.com$/.test(domain)) return 'Outlook';
  return 'Other';
}
