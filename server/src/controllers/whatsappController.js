import crypto from 'node:crypto';
import { User } from '../models/index.js';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { createLinkCode, handleIncoming } from '../services/whatsapp/bot.js';

const mask = (phone) => (phone ? `+${phone.slice(0, 2)} ••••• ${phone.slice(-4)}` : null);

function status(user) {
  const wa = user.whatsapp || {};
  return {
    configured: env.whatsapp.enabled,
    featureEnabled: !user.whatsappOff,
    botNumber: env.whatsapp.enabled ? env.whatsapp.botNumber : null,
    connected: Boolean(wa.phone),
    phone: mask(wa.phone),
    linkedAt: wa.linkedAt || null,
    remindersEnabled: wa.remindersEnabled !== false,
  };
}

const requireConfigured = () => { if (!env.whatsapp.enabled) throw ApiError.badRequest('WhatsApp is not set up on this server yet'); };

export const getStatus = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  res.json(status(user));
});

/** A one-time code to send from WhatsApp; the page polls getStatus until the number is connected. */
export const linkCode = asyncHandler(async (req, res) => {
  requireConfigured();
  if ((await User.findById(req.user._id).select('whatsappOff'))?.whatsappOff) throw ApiError.badRequest('WhatsApp is turned off for your account. Turn it on first.');
  const { code, expiresInMinutes } = await createLinkCode(req.user);
  const text = `link ${code}`;
  res.json({ code, text, expiresInMinutes, url: `https://wa.me/${env.whatsapp.botNumber}?text=${encodeURIComponent(text)}` });
});

export const updateSettings = asyncHandler(async (req, res) => {
  const { remindersEnabled, featureEnabled } = req.body;
  if (featureEnabled === false) {
    // Off means off: disconnect the number and cancel any connect code.
    await User.updateOne({ _id: req.user._id }, { $set: { whatsappOff: true }, $unset: { whatsapp: 1, whatsappLinkCode: 1, whatsappLinkExpiresAt: 1 } });
  } else if (featureEnabled === true) {
    await User.updateOne({ _id: req.user._id }, { $set: { whatsappOff: false } });
  }
  if (remindersEnabled !== undefined) {
    const user = await User.findById(req.user._id);
    if (!user.whatsapp?.phone) throw ApiError.badRequest('WhatsApp is not connected');
    user.whatsapp.remindersEnabled = remindersEnabled;
    await user.save();
  }
  res.json(status(await User.findById(req.user._id)));
});

export const disconnect = asyncHandler(async (req, res) => {
  await User.updateOne({ _id: req.user._id }, { $unset: { whatsapp: 1, whatsappLinkCode: 1, whatsappLinkExpiresAt: 1 } });
  res.json(status(await User.findById(req.user._id)));
});

// ---------- webhook (called by Meta, not by users) ----------
const same = (a, b) => {
  const x = crypto.createHash('sha256').update(String(a)).digest();
  const y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
};

/** Meta's one-time check when the webhook URL is saved in the app dashboard. */
export const verifyWebhook = (req, res) => {
  const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query;
  if (env.whatsapp.verifyToken && mode === 'subscribe' && same(token || '', env.whatsapp.verifyToken) && /^[\w-]{1,200}$/.test(challenge || '')) {
    return res.type('text/plain').send(challenge);
  }
  return res.sendStatus(403);
};

/** True if the request body was signed with the app secret (X-Hub-Signature-256). */
export function validSignature(req) {
  const header = req.get('x-hub-signature-256') || '';
  if (!env.whatsapp.appSecret || !req.rawBody || !header.startsWith('sha256=')) return false;
  const expected = `sha256=${crypto.createHmac('sha256', env.whatsapp.appSecret).update(req.rawBody).digest('hex')}`;
  return same(header, expected);
}

/** Incoming messages. Answered with 200 after processing (Meta retries anything else). */
export const receiveWebhook = asyncHandler(async (req, res) => {
  if (!validSignature(req)) return res.sendStatus(401);
  const messages = [];
  for (const entry of req.body?.entry || []) {
    for (const change of entry.changes || []) {
      const value = change.value || {};
      // Only messages to our own number (one Meta app can serve several).
      if (env.whatsapp.phoneNumberId && value.metadata?.phone_number_id && value.metadata.phone_number_id !== env.whatsapp.phoneNumberId) continue;
      for (const m of value.messages || []) {
        // Text, or the caption of a forwarded poster / PDF / video.
        const text = m.type === 'text' ? m.text?.body : m[m.type]?.caption || '';
        messages.push({ id: m.id, from: String(m.from || ''), timestamp: m.timestamp, text, forwarded: Boolean(m.context?.forwarded || m.context?.frequently_forwarded) });
      }
    }
  }
  // Several messages (e.g. a burst of forwarded jobs) are handled side by side. One failing message
  // shouldn't make Meta resend the whole batch.
  await Promise.all(messages.slice(0, 20).map((m) => handleIncoming(m).catch((e) => console.error('[whatsapp] message failed:', e.message))));
  return res.sendStatus(200);
});
