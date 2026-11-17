import { env } from '../../config/env.js';

/**
 * Sends WhatsApp messages. Built so that it can never cost money:
 *
 * - Only plain text messages exist here. Meta charges for "template" messages (the only kind allowed
 *   more than 24 hours after the user's last message); there is no code that sends one.
 * - Every message needs the time of the user's last message, and is refused unless that was less than
 *   FREE_WINDOW_MS ago. Meta's free window is 24 hours; this stops 30 minutes short of it, so a slow
 *   request can't cross the line.
 */
export const FREE_WINDOW_MS = 23.5 * 3_600_000;

export const insideFreeWindow = (lastInboundAt, now = new Date()) => {
  const at = lastInboundAt ? new Date(lastInboundAt).getTime() : NaN;
  return Number.isFinite(at) && at <= now.getTime() + 60_000 && now.getTime() - at < FREE_WINDOW_MS;
};

/** Messages "sent" while testing, newest last (tests read and clear this instead of calling Meta). */
export const testOutbox = [];

const MAX_TEXT = 4000; // WhatsApp's limit is 4096 characters

/**
 * Sends a text message, only inside the free window. `lastInboundAt` is when this person last messaged
 * the bot. Throws (and sends nothing) outside the window.
 */
export async function sendText(to, text, { lastInboundAt } = {}) {
  if (!insideFreeWindow(lastInboundAt)) {
    throw Object.assign(new Error('Not sent: outside the free 24-hour WhatsApp window'), { code: 'OUTSIDE_FREE_WINDOW' });
  }
  const payload = { to: String(to), type: 'text', text: { body: text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT - 1)}…` : text, preview_url: false } };
  if (env.isTest) { testOutbox.push(payload); return { messages: [{ id: `wamid.test.${testOutbox.length}` }] }; }

  const { apiVersion, phoneNumberId, token } = env.whatsapp;
  const res = await fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', ...payload }),
    signal: AbortSignal.timeout(10_000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw Object.assign(new Error(`WhatsApp API ${res.status}: ${body?.error?.message || 'request failed'}`), { code: body?.error?.code });
  }
  return body;
}

export const isWhatsAppConfigured = () => env.whatsapp.enabled;
