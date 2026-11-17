// Queries on sessions (student_id = user_metadata.id). Only SHA-256 hashes of tokens are ever stored.
import { db as defaultDb } from './db.js';

export async function insertSession({ tokenHash, studentId, lifetimeDays, userAgent }, db = defaultDb) {
  await db.query(
    `INSERT INTO sessions (token_hash, student_id, expires_at, user_agent)
     VALUES ($1, $2, now() + make_interval(days => $3), $4)`,
    [tokenHash, studentId, lifetimeDays, userAgent]);
}

export async function deleteSession(tokenHash, db = defaultDb) {
  await db.query('DELETE FROM sessions WHERE token_hash = $1', [tokenHash]);
}

// The live student behind an unexpired session, plus when it was last used.
export async function findStudentBySession(tokenHash, db = defaultDb) {
  const { rows } = await db.query(
    `SELECT m.*, se.last_seen_at
       FROM sessions se JOIN user_metadata m ON m.id = se.student_id
      WHERE se.token_hash = $1 AND se.expires_at > now() AND NOT m.is_deleted`,
    [tokenHash]);
  return rows[0] || null;
}

export async function extendSession(tokenHash, lifetimeDays, db = defaultDb) {
  await db.query(
    `UPDATE sessions SET last_seen_at = now(), expires_at = now() + make_interval(days => $2)
      WHERE token_hash = $1`,
    [tokenHash, lifetimeDays]);
}
