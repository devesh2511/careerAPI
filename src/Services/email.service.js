// Sends email through Resend's HTTP API (https://resend.com/docs/api-reference).
// Needs RESEND_API_KEY and EMAIL_FROM. Without a key, local runs print the
// email to the console instead; on Vercel that's an error, so codes never
// end up in production logs.
import { ApiError } from '../DTO/ApiError.js';

export async function sendEmail({ to, subject, text }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    if (process.env.VERCEL) throw new Error('RESEND_API_KEY is not set');
    console.log(`[email not sent: RESEND_API_KEY is not set]\nTo: ${to}\nSubject: ${subject}\n\n${text}\n`);
    return;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [to], subject, text }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    console.error(`resend: ${res.status} ${await res.text()}`);
    throw new ApiError(503, 'email_failed', "We couldn't send the email. Please try again later.");
  }
}
