import { Application, EmailAccount } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { assertObjectId } from '../utils/helpers.js';
import { guessProvider } from './authController.js';

async function loadOwned(req) {
  assertObjectId(req.params.id);
  const acct = await EmailAccount.findOne({ _id: req.params.id, user: req.user._id });
  if (!acct) throw ApiError.notFound('Email account not found');
  return acct;
}

async function makeDefault(userId, id) {
  await EmailAccount.updateMany({ user: userId, _id: { $ne: id } }, { isDefault: false });
  await EmailAccount.updateOne({ _id: id }, { isDefault: true });
}

export const listEmailAccounts = asyncHandler(async (req, res) => {
  const filter = { user: req.user._id };
  if (req.query.archived !== 'all') filter.isArchived = req.query.archived === 'true';
  const accounts = await EmailAccount.find(filter).sort({ isDefault: -1, createdAt: 1 }).lean();
  const counts = await Application.aggregate([
    { $match: { user: req.user._id, 'emailUsed.account': { $in: accounts.map((a) => a._id) } } },
    { $group: { _id: '$emailUsed.account', count: { $sum: 1 } } },
  ]);
  const map = new Map(counts.map((c) => [String(c._id), c.count]));
  res.json({ items: accounts.map((a) => ({ ...a, applicationCount: map.get(String(a._id)) || 0 })) });
});

export const createEmailAccount = asyncHandler(async (req, res) => {
  const { email } = req.body;
  if (await EmailAccount.exists({ user: req.user._id, email })) throw ApiError.conflict('This email address is already saved');
  const hasAny = await EmailAccount.exists({ user: req.user._id, isArchived: false });
  const acct = await EmailAccount.create({
    ...req.body, provider: req.body.provider || guessProvider(email), user: req.user._id, isDefault: false,
  });
  if (req.body.isDefault || !hasAny) await makeDefault(req.user._id, acct._id);
  res.status(201).json({ account: await EmailAccount.findById(acct._id) });
});

export const updateEmailAccount = asyncHandler(async (req, res) => {
  const acct = await loadOwned(req);
  const { isDefault, ...rest } = req.body;
  if (rest.email && rest.email !== acct.email
    && await EmailAccount.exists({ user: req.user._id, email: rest.email, _id: { $ne: acct._id } })) {
    throw ApiError.conflict('This email address is already saved');
  }
  for (const [k, v] of Object.entries(rest)) if (v !== undefined) acct.set(k, v);
  if (rest.isArchived) acct.isDefault = false;
  await acct.save();
  if (rest.email) {
    // Keep the address snapshot on linked applications in sync with the edited account.
    await Application.updateMany({ user: req.user._id, 'emailUsed.account': acct._id }, { 'emailUsed.address': acct.email });
  }
  if (isDefault) await makeDefault(req.user._id, acct._id);
  res.json({ account: await EmailAccount.findById(acct._id) });
});

/** Accounts referenced by applications are archived so history stays intact; others are deleted. */
export const deleteEmailAccount = asyncHandler(async (req, res) => {
  const acct = await loadOwned(req);
  const wasDefault = acct.isDefault;
  const refs = await Application.countDocuments({ user: req.user._id, 'emailUsed.account': acct._id });
  if (refs > 0) {
    acct.isArchived = true;
    acct.isDefault = false;
    await acct.save();
  } else {
    await acct.deleteOne();
  }
  if (wasDefault) {
    const next = await EmailAccount.findOne({ user: req.user._id, isArchived: false }).sort({ createdAt: 1 });
    if (next) await makeDefault(req.user._id, next._id);
  }
  res.json(refs > 0
    ? { archived: true, references: refs, message: `Archived — used by ${refs} application(s)` }
    : { deleted: true, message: 'Email account removed' });
});
