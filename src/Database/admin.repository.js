// Queries on admins and admin_sessions. Only SHA-256 hashes of session
// tokens are ever stored.
import { db as defaultDb } from './db.js';

const COLUMNS = 'id, email, full_name, last_login_at, is_deleted, deleted_at, created_at';

// Deleted or not (the service decides), with the password hash.
export async function findByEmail(email, db = defaultDb) {
  const { rows } = await db.query('SELECT * FROM admins WHERE lower(email) = lower($1)', [email]);
  return rows[0] || null;
}

export async function touchLastLogin(adminId, db = defaultDb) {
  await db.query('UPDATE admins SET last_login_at = now() WHERE id = $1', [adminId]);
}

export async function insertSession({ tokenHash, adminId, lifetimeHours, userAgent }, db = defaultDb) {
  await db.query(
    `INSERT INTO admin_sessions (token_hash, admin_id, expires_at, user_agent)
     VALUES ($1, $2, now() + make_interval(hours => $3), $4)`,
    [tokenHash, adminId, lifetimeHours, userAgent]);
}

export async function deleteSession(tokenHash, db = defaultDb) {
  await db.query('DELETE FROM admin_sessions WHERE token_hash = $1', [tokenHash]);
}

// The live admin behind an unexpired session.
export async function findBySession(tokenHash, db = defaultDb) {
  const { rows } = await db.query(
    `SELECT a.id, a.email, a.full_name
       FROM admin_sessions se JOIN admins a ON a.id = se.admin_id
      WHERE se.token_hash = $1 AND se.expires_at > now() AND NOT a.is_deleted`,
    [tokenHash]);
  return rows[0] || null;
}

export async function list(deleted, db = defaultDb) {
  const { rows } = await db.query(
    `SELECT ${COLUMNS} FROM admins WHERE is_deleted = $1 ORDER BY full_name, email`, [deleted]);
  return rows;
}

// A duplicate email surfaces as 23505 on admins_email_key.
export async function insert({ email, fullName, passwordHash }, db = defaultDb) {
  const { rows } = await db.query(
    'INSERT INTO admins (email, full_name, password_hash) VALUES ($1, $2, $3) RETURNING id',
    [email, fullName, passwordHash]);
  return rows[0];
}

export async function exists(adminId, db = defaultDb) {
  const { rows } = await db.query('SELECT 1 FROM admins WHERE id = $1', [adminId]);
  return rows.length > 0;
}

// Soft delete also ends every session of that admin (schema §7).
export async function softDelete(adminId, db = defaultDb) {
  await db.query(
    'UPDATE admins SET is_deleted = true, deleted_at = coalesce(deleted_at, now()) WHERE id = $1', [adminId]);
  await db.query('DELETE FROM admin_sessions WHERE admin_id = $1', [adminId]);
}

// Sessions cascade; contests, schools and roster rows keep created_by/added_by = NULL.
export async function hardDelete(adminId, db = defaultDb) {
  await db.query('DELETE FROM admins WHERE id = $1', [adminId]);
}

export async function restore(adminId, db = defaultDb) {
  const { rowCount } = await db.query(
    'UPDATE admins SET is_deleted = false, deleted_at = NULL WHERE id = $1', [adminId]);
  return rowCount > 0;
}

// ── Password resets (admin_password_resets) ──

// Replaces any earlier code, unless one was issued in the last cooldownSeconds.
// Returns false when the cooldown blocked it.
export async function upsertPasswordReset({ adminId, codeHash, lifetimeMinutes, cooldownSeconds }, db = defaultDb) {
  const { rowCount } = await db.query(
    `INSERT INTO admin_password_resets (admin_id, code_hash, expires_at)
     VALUES ($1, $2, now() + make_interval(mins => $3))
     ON CONFLICT (admin_id) DO UPDATE
       SET code_hash = EXCLUDED.code_hash, attempts = 0,
           created_at = now(), expires_at = EXCLUDED.expires_at
       WHERE admin_password_resets.created_at < now() - make_interval(secs => $4)`,
    [adminId, codeHash, lifetimeMinutes, cooldownSeconds]);
  return rowCount > 0;
}

// The unexpired reset for a live admin, by email, locked for the check.
export async function findPasswordReset(email, db = defaultDb) {
  const { rows } = await db.query(
    `SELECT r.admin_id, r.code_hash, r.attempts
       FROM admin_password_resets r JOIN admins a ON a.id = r.admin_id
      WHERE lower(a.email) = lower($1) AND NOT a.is_deleted AND r.expires_at > now()
      FOR UPDATE OF r`,
    [email]);
  return rows[0] || null;
}

export async function countPasswordResetAttempt(adminId, db = defaultDb) {
  await db.query('UPDATE admin_password_resets SET attempts = attempts + 1 WHERE admin_id = $1', [adminId]);
}

export async function deletePasswordReset(adminId, db = defaultDb) {
  await db.query('DELETE FROM admin_password_resets WHERE admin_id = $1', [adminId]);
}

// Sets a new password and ends every session of that admin.
export async function setPassword(adminId, passwordHash, db = defaultDb) {
  await db.query('UPDATE admins SET password_hash = $1 WHERE id = $2', [passwordHash, adminId]);
  await db.query('DELETE FROM admin_sessions WHERE admin_id = $1', [adminId]);
}
