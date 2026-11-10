import nodemailer from 'nodemailer';
import { env } from '../config/env.js';

let transporter;

export const isMailConfigured = () => Boolean(env.smtp.host);

function getTransporter() {
  if (transporter) return transporter;
  transporter = isMailConfigured()
    ? nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.secure,
      auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.pass } : undefined,
    })
    // Without SMTP settings, render the message as JSON so development still "works".
    : nodemailer.createTransport({ jsonTransport: true });
  return transporter;
}

const addressOf = (s) => (/<([^>]+)>/.exec(s || '')?.[1] || s || '').trim().toLowerCase();
const nameOf = (s) => (/^\s*"?([^"<]*?)"?\s*</.exec(s || '')?.[1] || '').trim();

/**
 * The From address must be the account that actually sends (SMTP_USER). Gmail and other providers
 * treat a From address that differs from the sending account as possible spoofing and file it as
 * spam. So when they differ, send from SMTP_USER and put the configured address in Reply-To.
 */
export function senderHeaders(from = env.smtp.from, smtpUser = env.smtp.user) {
  const user = addressOf(smtpUser);
  if (!user.includes('@') || addressOf(from) === user) return { from };
  const name = nameOf(from) || 'Job Tracker';
  return { from: { name, address: user }, ...(addressOf(from).includes('@') && !addressOf(from).endsWith('.local') && { replyTo: addressOf(from) }) };
}

export async function sendMail({ to, subject, text, html }) {
  const info = await getTransporter().sendMail({ ...senderHeaders(), to, subject, text, html });
  if (!isMailConfigured() && !env.isTest) {
    console.log(`[mail:dev] To: ${to} | ${subject}`);
  }
  return info;
}
