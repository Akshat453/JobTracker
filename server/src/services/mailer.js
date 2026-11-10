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

export async function sendMail({ to, subject, text, html }) {
  const info = await getTransporter().sendMail({ from: env.smtp.from, to, subject, text, html });
  if (!isMailConfigured() && !env.isTest) {
    console.log(`[mail:dev] To: ${to} | ${subject}`);
  }
  return info;
}
