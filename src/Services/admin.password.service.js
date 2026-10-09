// Forgotten admin passwords (schema §3.3): email a 6-digit code, then trade
// the code for a new password. Neither step says whether an email belongs to
// an admin.
import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { withTransaction } from '../Database/db.js';
import * as admins from '../Database/admin.repository.js';
import { ApiError } from '../DTO/ApiError.js';
import { hashPassword } from './password.service.js';
import { sendEmail } from './email.service.js';

const LIFETIME_MINUTES = 15;
const COOLDOWN_SECONDS = 60;
const MAX_ATTEMPTS = 5;

// Salted with the admin id so equal codes for two admins hash differently.
const hashCode = (adminId, code) => createHash('sha256').update(`${adminId}:${code}`).digest();

// req: ForgotPasswordRequest.
export async function requestReset(req) {
  const found = await admins.findByEmail(req.email);
  if (!found || found.is_deleted) return;

  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const issued = await admins.upsertPasswordReset({
    adminId: found.id, codeHash: hashCode(found.id, code),
    lifetimeMinutes: LIFETIME_MINUTES, cooldownSeconds: COOLDOWN_SECONDS,
  });
  if (!issued) return;

  await sendEmail({
    to: found.email,
    subject: 'Your careerAI admin password reset code',
    text: `Hi ${found.full_name},\n\n` +
      `Your code to reset your careerAI admin password is ${code}\n\n` +
      `It expires in ${LIFETIME_MINUTES} minutes. If you didn't ask for this, ignore this email; ` +
      'your password stays the same.\n',
  });
}

// req: ResetPasswordRequest. Signs the admin out everywhere on success.
export async function resetPassword(req) {
  const passwordHash = await hashPassword(req.newPassword);
  const ok = await withTransaction(async db => {
    const reset = await admins.findPasswordReset(req.email, db);
    if (!reset || reset.attempts >= MAX_ATTEMPTS) return false;
    if (!timingSafeEqual(hashCode(reset.admin_id, req.code), reset.code_hash)) {
      await admins.countPasswordResetAttempt(reset.admin_id, db);
      return false;
    }
    await admins.setPassword(reset.admin_id, passwordHash, db);
    await admins.deletePasswordReset(reset.admin_id, db);
    return true;
  });
  if (!ok) throw new ApiError(400, 'invalid_code', 'That code is wrong or has expired. Ask for a new one.', 'code');
}
