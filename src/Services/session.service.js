// Server-side student sessions (schema §2.3). The browser holds a random
// token; the database stores only its SHA-256 hash, so a database leak
// doesn't hand out live logins. Cookies are the controller's job.
import { createHash, randomBytes } from 'node:crypto';
import * as sessions from '../Database/session.repository.js';

export const LIFETIME_DAYS = 30;
// Sliding expiry: a session used at least once a day keeps extending.
const EXTEND_AFTER_MS = 24 * 3600e3;

const sha256 = token => createHash('sha256').update(token).digest();

// Returns the new token. `db` may be a transaction client.
export async function createSession(studentId, userAgent, db) {
  const token = randomBytes(32).toString('base64url');
  await sessions.insertSession({
    tokenHash: sha256(token), studentId, lifetimeDays: LIFETIME_DAYS,
    userAgent: userAgent ? userAgent.slice(0, 500) : null,
  }, db);
  return token;
}

export async function endSession(token) {
  if (token) await sessions.deleteSession(sha256(token));
}

// The student row behind a token, or null for a missing/expired session or
// a deleted student. `extended` says whether the cookie should be refreshed.
export async function resolveSession(token) {
  if (!token) return null;
  const hash = sha256(token);
  const row = await sessions.findStudentBySession(hash);
  if (!row) return null;
  const { last_seen_at, ...student } = row;
  const extended = Date.now() - last_seen_at.getTime() > EXTEND_AFTER_MS;
  if (extended) await sessions.extendSession(hash, LIFETIME_DAYS);
  return { student, extended };
}
