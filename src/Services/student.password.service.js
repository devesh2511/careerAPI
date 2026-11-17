// Forgotten student passwords, by emailed link. Clicking the link proves the
// student can read that inbox, so it also verifies the email.
//
//   1. POST /auth/forgot-password { username }. If the account has an email,
//      the link goes there. If not, the answer is needs_email and the page
//      asks for one.
//   2. POST /auth/forgot-password { username, email, full_name, phone_no,
//      institute_code }. The same proof registration asks for. When it
//      matches the account, the link goes to that email. A verified email is
//      never replaced this way.
//   3. POST /auth/reset-password { token, new_password } from the link.
//
// This is only as strong as registration itself: anyone who knows a
// student's name, phone and institute ID could do step 2. An admin can
// always set a new password instead.
import { createHash, randomBytes } from 'node:crypto';
import { withTransaction } from '../Database/db.js';
import * as students from '../Database/student.repository.js';
import { isOnListOf } from '../Database/studentList.repository.js';
import { ApiError } from '../DTO/ApiError.js';
import { hashPassword } from './password.service.js';
import { sendEmail } from './email.service.js';

const LIFETIME_MINUTES = 30;
const COOLDOWN_SECONDS = 60;

const sha256 = token => createHash('sha256').update(token).digest();

// Where the emailed link points: APP_URL, else the first CORS origin.
function appUrl() {
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

// req: ForgotPasswordRequest. → { needs_email }
export async function requestReset(req) {
  const student = await students.findLiveByUsername(req.username);

  if (!req.proof) {
    // An unknown username also gets needs_email, so this doesn't say which
    // usernames exist.
    if (!student || !student.email) return { needs_email: true };
    await sendLink(student, student.email);
    return { needs_email: false };
  }

  const p = req.proof;
  const matches = student && !student.email_verified_at &&
    student.phone_no === p.phoneNo && student.name.toLowerCase() === p.name.toLowerCase() &&
    await isOnListOf(student.id, p.instituteCode);
  if (matches) await sendLink(student, req.email);
  return { needs_email: false };
}

// req: ResetPasswordRequest. Signs the student out everywhere on success.
export async function resetPassword(req) {
  const passwordHash = await hashPassword(req.newPassword);
  const ok = await withTransaction(async db => {
    const link = await students.findResetLink(sha256(req.token), db);
    if (!link) return false;
    await students.setPassword(link.student_id, passwordHash, db);
    await students.verifyEmail(link.student_id, link.email, db);
    await students.deleteResetLink(link.student_id, db);
    return true;
  });
  if (!ok) throw new ApiError(400, 'invalid_link', 'This link is wrong or has expired. Ask for a new one.', 'token');
}
