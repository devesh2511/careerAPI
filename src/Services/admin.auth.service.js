// Admin login and server-side admin sessions (schema §3.2). Same rules as
// student sessions, in their own table with a shorter, fixed life.
import { createHash, randomBytes } from 'node:crypto';
import * as admins from '../Database/admin.repository.js';
import { ApiError } from '../DTO/ApiError.js';
import { AdminRefDTO } from '../DTO/AdminDTO.js';
import { verifyPassword, DUMMY_HASH } from './password.service.js';

export const LIFETIME_HOURS = 12;

const sha256 = token => createHash('sha256').update(token).digest();

// req: LoginRequest. Same answer for an unknown email, a wrong password and
// a deleted admin, and all three take about as long.
export async function login(req, userAgent) {
  const found = await admins.findByEmail(req.email);
  const ok = await verifyPassword(req.password, found ? found.password_hash : DUMMY_HASH);
  if (!found || !ok || found.is_deleted) {
    throw new ApiError(401, 'bad_credentials', 'Email or password is incorrect.');
  }
  await admins.touchLastLogin(found.id);
  const token = randomBytes(32).toString('base64url');
  await admins.insertSession({
    tokenHash: sha256(token), adminId: found.id, lifetimeHours: LIFETIME_HOURS,
    userAgent: userAgent ? userAgent.slice(0, 500) : null,
  });
  return { token, body: { admin: new AdminRefDTO(found) } };
}

export async function logout(token) {
  if (token) await admins.deleteSession(sha256(token));
}

// { id, email, full_name } of the live admin behind a token, or null.
export async function resolveAdminSession(token) {
  if (!token) return null;
  return admins.findBySession(sha256(token));
}
