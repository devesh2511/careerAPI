// Forgotten student passwords: email a 6-digit code, then trade the code for
// a new password. Same flow as admin.password.service.js. Neither step says
// whether an email has an account.
import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { withTransaction } from '../Database/db.js';
import * as students from '../Database/student.repository.js';
import { ApiError } from '../DTO/ApiError.js';
import { hashPassword } from './password.service.js';
import { sendEmail } from './email.service.js';

const LIFETIME_MINUTES = 15;
const COOLDOWN_SECONDS = 60;
const MAX_ATTEMPTS = 5;

// Salted with the student id so equal codes for two students hash differently.
const hashCode = (studentId, code) => createHash('sha256').update(`${studentId}:${code}`).digest();

// req: ForgotPasswordRequest.
export async function requestReset(req) {
  const found = await students.findPasswordLogin(req.email);
  if (!found || found.is_deleted) return;

  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const issued = await students.upsertPasswordReset({
    studentId: found.id, codeHash: hashCode(found.id, code),
    lifetimeMinutes: LIFETIME_MINUTES, cooldownSeconds: COOLDOWN_SECONDS,
  });
  if (!issued) return;

  await sendEmail({
    to: found.email,
    subject: 'Your careerAI password reset code',
    text: `Hi ${found.full_name},\n\n` +
      `Your code to reset your careerAI password is ${code}\n\n` +
      `It expires in ${LIFETIME_MINUTES} minutes. If you didn't ask for this, ignore this email; ` +
      'your password stays the same.\n',
  });
}

// req: ResetPasswordRequest. Signs the student out everywhere on success.
export async function resetPassword(req) {
  const passwordHash = await hashPassword(req.newPassword);
  const ok = await withTransaction(async db => {
    const reset = await students.findPasswordReset(req.email, db);
    if (!reset || reset.attempts >= MAX_ATTEMPTS) return false;
    if (!timingSafeEqual(hashCode(reset.student_id, req.code), reset.code_hash)) {
      await students.countPasswordResetAttempt(reset.student_id, db);
      return false;
    }
    await students.setPassword(reset.student_id, passwordHash, db);
    await students.deletePasswordReset(reset.student_id, db);
    return true;
  });
  if (!ok) throw new ApiError(400, 'invalid_code', 'That code is wrong or has expired. Ask for a new one.', 'code');
}
