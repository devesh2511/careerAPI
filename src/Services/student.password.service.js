// Forgotten student passwords, by emailed link, only ever to an email the
// student has confirmed (Confirm email on their account page,
// email.confirm.service.js).
//
//   1. POST /auth/forgot-password { username }. If the account has a
//      confirmed email, the link goes there. The answer is the same either
//      way, so it says nothing about which usernames exist or which have a
//      confirmed email.
//   2. POST /auth/reset-password { token, new_password } from the link.
//
// A student without a confirmed email asks their institute to contact us:
// an admin sets a new password (POST /admin/students/:id/password).
import { createHash, randomBytes } from 'node:crypto';
import { withTransaction } from '../Database/db.js';
import * as students from '../Database/student.repository.js';
import { ApiError } from '../DTO/ApiError.js';
import { hashPassword } from './password.service.js';
import { sendEmail } from './email.service.js';

const LIFETIME_MINUTES = 30;
const COOLDOWN_SECONDS = 60;

const sha256 = token => createHash('sha256').update(token).digest();

// Where the emailed link points: APP_URL, else the first CORS origin.
export function appUrl() {
  const url = process.env.APP_URL || (process.env.CORS_ORIGINS || '').split(',')[0].trim() || 'http://localhost:3000';
  return url.replace(/\/+$/, '');
}

async function sendLink(student, email) {
  const token = randomBytes(32).toString('base64url');
  const issued = await students.upsertResetLink({
    studentId: student.id, tokenHash: sha256(token), email,
    lifetimeMinutes: LIFETIME_MINUTES, cooldownSeconds: COOLDOWN_SECONDS,
  });
  if (!issued) return;
  const link = `${appUrl()}/pages/auth.html#reset=${token}`;
  await sendEmail({
    to: email,
    subject: 'Reset your careerAI password',
    text: `Hi ${student.name},\n\n` +
      `Open this link to set a new careerAI password for ${student.username}:\n\n${link}\n\n` +
      `It works once and expires in ${LIFETIME_MINUTES} minutes. Opening it also confirms this is your email. ` +
      "If you didn't ask for this, ignore this email; your password stays the same.\n",
  });
}

// The slowest the answer comes back, whether or not an email was sent, so
// response times don't tell the cases apart (sending takes ~1-2 s).
const MIN_ANSWER_MS = 2500;
const sleep = ms => new Promise(r => setTimeout(r, ms));

// req: ForgotPasswordRequest. → { ok: true }, whatever happened.
export async function requestReset(req) {
  const started = Date.now();
  try {
    const student = await students.findLiveByUsername(req.username);
    if (student && student.email && student.email_verified_at) await sendLink(student, student.email);
  } catch (err) {
    // A failed send would otherwise say this account has a confirmed email.
    console.error('forgot-password: email not sent:', err.message);
  }
  await sleep(MIN_ANSWER_MS - (Date.now() - started));
  return { ok: true };
}

// req: ResetPasswordRequest. Signs the student out everywhere on success.
export async function resetPassword(req) {
  const passwordHash = await hashPassword(req.newPassword);
  const ok = await withTransaction(async db => {
    const link = await students.findResetLink(sha256(req.token), db);
    if (!link) return false;
    await students.setPassword(link.student_id, passwordHash, db);
    // Links only go to confirmed emails, and changing the email deletes them,
    // so this just re-confirms the account's current email.
    await students.verifyEmail(link.student_id, link.email, db);
    await students.deleteResetLink(link.student_id, db);
    return true;
  });
  if (!ok) throw new ApiError(400, 'invalid_link', 'This link is wrong or has expired. Ask for a new one.', 'token');
}
