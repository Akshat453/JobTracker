import { Application, Friendship, SharedJob, User } from '../models/index.js';
import { pairKeyOf } from '../models/Friendship.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { assertObjectId, escapeHtml } from '../utils/helpers.js';
import { sendMail, isMailConfigured } from '../services/mailer.js';
import { assignFriendCode, getFriendCode } from '../utils/friendCode.js';
import { appUrl, createShareDoc } from './shareController.js';

const PUBLIC_USER = 'name email';
const emailOf = (u) => u.notificationPrefs?.notifyEmail || u.email;

/** Best-effort email: a failed or unconfigured mail server never blocks the in-app action. */
async function notify(to, subject, text, html) {
  if (!isMailConfigured()) return false;
  try { await sendMail({ to, subject, text, html }); return true; } catch (e) {
    console.error('[friends] email failed:', e.message);
    return false;
  }
}

const page = (body) => `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#222">${body}</body></html>`;

/** GET /friends: accepted friends plus pending requests in both directions. */
export const listFriends = asyncHandler(async (req, res) => {
  const me = req.user._id;
  const rows = await Friendship.find({ $or: [{ requester: me }, { recipient: me }] })
    .populate('requester', PUBLIC_USER).populate('recipient', PUBLIC_USER).sort({ updatedAt: -1 }).lean();
  const other = (f) => (String(f.requester?._id) === String(me) ? f.recipient : f.requester);
  const view = (f) => ({ _id: f._id, user: other(f), since: f.acceptedAt || f.createdAt });
  const valid = rows.filter((f) => f.requester && f.recipient);
  res.json({
    myCode: await getFriendCode(me),
    friends: valid.filter((f) => f.status === 'accepted').map(view),
    incoming: valid.filter((f) => f.status === 'pending' && String(f.recipient._id) === String(me)).map(view),
    // Until they accept, you only see the name: a friend code alone shouldn't reveal someone's email.
    outgoing: valid.filter((f) => f.status === 'pending' && String(f.requester._id) === String(me))
      .map((f) => ({ ...view(f), user: { _id: f.recipient._id, name: f.recipient.name } })),
  });
});

/** GET /friends/summary: counts for the sidebar badge. */
export const summary = asyncHandler(async (req, res) => {
  const me = req.user._id;
  const [requests, shared] = await Promise.all([
    Friendship.countDocuments({ recipient: me, status: 'pending' }),
    SharedJob.countDocuments({ recipient: me, 'responses.user': { $ne: me }, expiresAt: { $gt: new Date() } }),
  ]);
  res.json({ requests, shared });
});

/** POST /friend-code/regenerate: replaces the user's code; the old one stops working. */
export const regenerateCode = asyncHandler(async (req, res) => {
  res.json({ myCode: await assignFriendCode(req.user._id) });
});

/**
 * POST /friends: sends a friend request to the user with this friend code. There is no way to search
 * or list users, so people can only be added with a code they chose to share.
 */
export const sendRequest = asyncHandler(async (req, res) => {
  const me = req.user;
  const target = await User.findOne({ friendCode: req.body.code }).select('name email notificationPrefs');
  if (!target) throw ApiError.notFound('No one has that friend code. Check it with your friend; they can find it on their Friends page.');
  if (target._id.equals(me._id)) throw ApiError.badRequest("That's your own friend code");

  const existing = await Friendship.findOne({ pairKey: pairKeyOf(me._id, target._id) });
  if (existing?.status === 'accepted') throw ApiError.conflict(`You and ${target.name} are already friends`);
  if (existing && existing.requester.equals(me._id)) throw ApiError.conflict(`You already sent ${target.name} a request`);
  if (existing) {
    // They had already asked us: sending one back simply accepts it.
    existing.status = 'accepted';
    existing.acceptedAt = new Date();
    await existing.save();
    return res.json({ status: 'accepted', message: `You and ${target.name} are now friends` });
  }

  try {
    await Friendship.create({ pairKey: pairKeyOf(me._id, target._id), requester: me._id, recipient: target._id });
  } catch (e) {
    if (e.code === 11000) throw ApiError.conflict('A request between you two already exists');
    throw e;
  }
  const link = appUrl('/friends');
  await notify(
    emailOf(target),
    `${me.name} sent you a friend request on Job Tracker`,
    `Hi ${target.name},\n\n${me.name} (${me.email}) wants to be friends on Job Tracker, so you can send each other job openings.\n\nAccept or decline: ${link}\n`,
    page(`<p>Hi ${escapeHtml(target.name)},</p><p><strong>${escapeHtml(me.name)}</strong> (${escapeHtml(me.email)}) wants to be friends on Job Tracker, so you can send each other job openings.</p><p>Accept or decline: <a href="${escapeHtml(link)}">${escapeHtml(link)}</a></p>`),
  );
  res.status(201).json({ status: 'pending', message: `Friend request sent to ${target.name}` });
});

async function loadFriendship(req) {
  assertObjectId(req.params.id);
  const f = await Friendship.findOne({ _id: req.params.id, $or: [{ requester: req.user._id }, { recipient: req.user._id }] });
  if (!f) throw ApiError.notFound('Friend request not found');
  return f;
}

/** POST /friends/:id/accept: only the person who received the request can accept it. */
export const acceptRequest = asyncHandler(async (req, res) => {
  const f = await loadFriendship(req);
  if (f.status === 'accepted') return res.json({ ok: true });
  if (!f.recipient.equals(req.user._id)) throw ApiError.forbidden('Only the person you asked can accept this request');
  f.status = 'accepted';
  f.acceptedAt = new Date();
  await f.save();
  res.json({ ok: true });
});

/** DELETE /friends/:id: declines, cancels or unfriends, depending on the state. */
export const removeFriendship = asyncHandler(async (req, res) => {
  const f = await loadFriendship(req);
  await f.deleteOne();
  res.json({ ok: true });
});

/**
 * POST /friends/send-jobs: sends some of the user's own jobs to one or more friends. Each friend gets
 * them in "Shared with me" and one email listing all of them. Only the four public fields are shared.
 */
export const sendJobs = asyncHandler(async (req, res) => {
  const me = req.user;
  const { applicationIds, friendIds, message } = req.body;

  const apps = await Application.find({ _id: { $in: applicationIds }, user: me._id })
    .select('company.name company.website jobTitle jobPostingUrl').lean();
  if (apps.length !== applicationIds.length) throw ApiError.notFound('Some of the selected jobs were not found');
  // Keep the order the user selected them in.
  const order = new Map(applicationIds.map((id, i) => [id, i]));
  apps.sort((a, b) => order.get(String(a._id)) - order.get(String(b._id)));

  const friendships = await Friendship.find({ pairKey: { $in: friendIds.map((id) => pairKeyOf(me._id, id)) }, status: 'accepted' }).lean();
  if (friendships.length !== friendIds.length) throw ApiError.badRequest('You can only send jobs to accepted friends');
  const friends = await User.find({ _id: { $in: friendIds } }).select('name email notificationPrefs').lean();

  const inboxLink = appUrl('/friends?tab=shared');
  let emailed = 0;
  for (const friend of friends) {
    const links = [];
    for (const app of apps) links.push((await createShareDoc({ owner: me._id, app, recipient: friend._id, message })).url);

    const n = apps.length;
    const subject = n === 1
      ? `${me.name} shared a job with you: ${apps[0].jobTitle} at ${apps[0].company.name}`
      : `${me.name} shared ${n} jobs with you`;
    const text = [
      `Hi ${friend.name},`, '',
      `${me.name} thinks ${n === 1 ? 'this job' : 'these jobs'} might interest you:`, '',
      ...(message ? [`"${message}"`, ''] : []),
      ...apps.flatMap((a, i) => [
        `${i + 1}. ${a.jobTitle} at ${a.company.name}`,
        ...(a.jobPostingUrl ? [`   Job posting: ${a.jobPostingUrl}`] : []),
        ...(a.company.website ? [`   Company: ${a.company.website}`] : []),
        `   Add to your Job Tracker: ${links[i]}`, '',
      ]),
      `See all jobs shared with you: ${inboxLink}`, '',
      'You get this because you are friends on Job Tracker.',
    ].join('\n');
    const html = page(
      `<p>Hi ${escapeHtml(friend.name)},</p><p>${escapeHtml(me.name)} thinks ${n === 1 ? 'this job' : 'these jobs'} might interest you:</p>`
      + (message ? `<blockquote style="margin:0 0 12px;padding:8px 12px;border-left:3px solid #6366f1;color:#444">${escapeHtml(message)}</blockquote>` : '')
      + `<ol style="padding-left:20px">${apps.map((a, i) => `<li style="margin:0 0 14px"><strong>${escapeHtml(a.jobTitle)}</strong> at ${escapeHtml(a.company.name)}<br>`
        + (a.jobPostingUrl ? `<a href="${escapeHtml(a.jobPostingUrl)}">Job posting</a> · ` : '')
        + (a.company.website ? `<a href="${escapeHtml(a.company.website)}">Company website</a> · ` : '')
        + `<a href="${escapeHtml(links[i])}">Add to my Job Tracker</a></li>`).join('')}</ol>`
      + `<p>See all jobs shared with you: <a href="${escapeHtml(inboxLink)}">${escapeHtml(inboxLink)}</a></p>`
      + '<p style="color:#777;font-size:12px">You get this because you are friends on Job Tracker.</p>',
    );
    if (await notify(emailOf(friend), subject, text, html)) emailed += 1;
  }

  res.status(201).json({ jobs: apps.length, friends: friends.length, emailed, emailConfigured: isMailConfigured() });
});
