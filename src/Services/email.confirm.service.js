// Confirming a student's email: only when they click "Confirm email" on
// their account page (never at registration). The emailed link proves they
// can read that inbox; forgot-password only ever uses a confirmed email.
//
//   1. POST /me/email/confirm (logged in). Sends a link to the account's
//      current email, unless it's confirmed already or one went out under a
//      minute ago.
//   2. POST /auth/confirm-email { token } from the link (no login needed:
//      they may open it on another device). Confirms the email if it's still
//      the one the link went to.
//
// Changing the email deletes any link sent to the old one
// (student.service.js → setDetails).
import { createHash, randomBytes } from 'node:crypto';
import { withTransaction } from '../Database/db.js';
import * as students from '../Database/student.repository.js';
import { ApiError } from '../DTO/ApiError.js';
import { sendEmail } from './email.service.js';
import { appUrl } from './student.password.service.js';

const LIFETIME_HOURS = 24;
const COOLDOWN_SECONDS = 60;

const sha256 = token => createHash('sha256').update(token).digest();

// student: the logged-in user_metadata row.
// → { status: 'sent' | 'already_sent' | 'already_verified' }
export async function requestConfirmation(student) {
  const s = await students.findById(student.id);
  if (!s.email) throw new ApiError(400, 'no_email', 'Add an email first.', 'email');
  if (s.email_verified_at) return { status: 'already_verified' };

  const token = randomBytes(32).toString('base64url');
  const issued = await students.upsertConfirmLink({
    studentId: s.id, tokenHash: sha256(token), email: s.email,
    lifetimeHours: LIFETIME_HOURS, cooldownSeconds: COOLDOWN_SECONDS,
  });
  if (!issued) return { status: 'already_sent' };
  const link = `${appUrl()}/pages/auth.html#confirm=${token}`;
  await sendEmail({
    to: s.email,
    subject: 'Confirm your careerAI email',
    text: `Hi ${s.name},\n\n` +
      `Open this link to confirm this is the email for your careerAI account (${s.username}):\n\n${link}\n\n` +
      `It works once and expires in ${LIFETIME_HOURS} hours. Once it's confirmed, you can reset your password ` +
      "by email if you ever forget it. If you didn't ask for this, ignore this email.\n",
  });
  return { status: 'sent' };
}

// req: ConfirmEmailRequest.
export async function confirm(req) {
  const ok = await withTransaction(async db => {
    const link = await students.findConfirmLink(sha256(req.token), db);
    if (!link) return false;
    await students.deleteConfirmLink(link.student_id, db);
    if (link.current_email !== link.email) return false;
    await students.verifyEmail(link.student_id, link.email, db);
    return true;
  });
  if (!ok) throw new ApiError(400, 'invalid_link', 'This link is wrong or has expired. Ask for a new one.', 'token');
}
