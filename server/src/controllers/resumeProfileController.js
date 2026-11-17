import { ResumeProfile } from '../models/index.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/** The user's resume sections; an empty one if they haven't saved any yet. */
export const getProfile = asyncHandler(async (req, res) => {
  const profile = await ResumeProfile.findOne({ user: req.user._id });
  res.json({ profile: profile || new ResumeProfile({ user: req.user._id }) });
});

/** Replaces all sections with what was sent (the page always sends the whole set). */
const LISTS = ['experience', 'education', 'projects', 'skills', 'extras'];

export const saveProfile = asyncHandler(async (req, res) => {
  // New entries come without an id; let MongoDB give them one.
  for (const key of LISTS) req.body[key] = req.body[key].map(({ _id, ...rest }) => (_id ? { _id, ...rest } : rest));
  const profile = await ResumeProfile.findOneAndUpdate(
    { user: req.user._id },
    { $set: req.body, $setOnInsert: { user: req.user._id } },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
  );
  res.json({ profile });
});
