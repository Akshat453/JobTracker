import { env } from '../../config/env.js';

/** Messages "sent" while testing, newest last (tests read and clear this instead of calling Meta). */
export const testOutbox = [];

const MAX_TEXT = 4000; // WhatsApp's limit is 4096 characters

async function post(payload) {
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
    const err = new Error(`WhatsApp API ${res.status}: ${body?.error?.message || 'request failed'}`);
    err.code = body?.error?.code;
    throw err;
  }
  return body;
}

/** A normal message. Only allowed within 24 hours of the user's last message to the bot. */
export function sendText(to, text) {
  const body = text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT - 1)}…` : text;
  return post({ to, type: 'text', text: { body, preview_url: false } });
}

/** An approved template message: the only kind WhatsApp allows outside the 24-hour window. */
export function sendTemplate(to, name, params = []) {
  // Template parameters can't contain new lines, tabs or more than 4 spaces in a row.
  const clean = (p) => String(p).replace(/[\n\t]+/g, ' · ').replace(/ {4,}/g, '   ').slice(0, 900);
  return post({
    to, type: 'template',
    template: {
      name, language: { code: env.whatsapp.templateLanguage },
      components: params.length ? [{ type: 'body', parameters: params.map((p) => ({ type: 'text', text: clean(p) })) }] : [],
    },
  });
}

export const isWhatsAppConfigured = () => env.whatsapp.enabled;
