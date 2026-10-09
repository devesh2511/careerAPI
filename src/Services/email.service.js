// Sends email through Gmail SMTP with nodemailer. Needs SMTP_USER (the Gmail
// address) and SMTP_PASS (a Google app password, not the account password).
// Without them, local runs print the email to the console instead; on Vercel
// that's an error, so codes never end up in production logs.
import nodemailer from 'nodemailer';
import { ApiError } from '../DTO/ApiError.js';

let transporter;

export async function sendEmail({ to, subject, text }) {
  const { SMTP_USER: user, SMTP_PASS: pass } = process.env;
  if (!user || !pass) {
    if (process.env.VERCEL) throw new Error('SMTP_USER and SMTP_PASS must be set');
    console.log(`[email not sent: SMTP_USER/SMTP_PASS not set]\nTo: ${to}\nSubject: ${subject}\n\n${text}\n`);
    return;
  }
  transporter ??= nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 10_000,
  });
  try {
    // Gmail rewrites any other From address to the account's own, so use it directly.
    await transporter.sendMail({ from: { name: 'careerAI', address: user }, to, subject, text });
  } catch (err) {
    console.error(`smtp: ${err.code ?? ''} ${err.response ?? err.message}`);
    throw new ApiError(503, 'email_failed', "We couldn't send the email. Please try again later.");
  }
}
