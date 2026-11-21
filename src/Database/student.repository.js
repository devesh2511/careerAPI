// Queries on user_metadata: student accounts. A student is the person on
// one or more institute lists ("user" rows pointing here); this row is their
// login, details and app state.
import { db as defaultDb } from './db.js';

// A duplicate surfaces as 23505 on user_metadata_username_key (username
// taken) or user_metadata_person_key (this person already has an account).
export async function insertStudent(s, db = defaultDb) {
  const { rows } = await db.query(
    `INSERT INTO user_metadata (username, name, phone_no, email, password, city, class, board, last_login_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now()) RETURNING *`,
    [s.username, s.name, s.phoneNo, s.email, s.passwordHash, s.city, s.class, s.board]);
  return rows[0];
}

// The account of this person (name ignoring case + phone), deleted or not.
export async function findByPerson({ name, phoneNo }, db = defaultDb) {
  const { rows } = await db.query(
    'SELECT * FROM user_metadata WHERE phone_no = $1 AND lower(name) = lower($2)', [phoneNo, name]);
  return rows[0] || null;
}

// By username, deleted or not (the service decides). null when no such username.
export async function findByUsername(username, db = defaultDb) {
  const { rows } = await db.query('SELECT * FROM user_metadata WHERE username = $1', [username]);
  return rows[0] || null;
}

export async function findLiveByUsername(username, db = defaultDb) {
  const { rows } = await db.query(
    'SELECT * FROM user_metadata WHERE username = $1 AND NOT is_deleted AND deactivated_at IS NULL', [username]);
  return rows[0] || null;
}

export async function findById(studentId, db = defaultDb) {
  const { rows } = await db.query('SELECT * FROM user_metadata WHERE id = $1', [studentId]);
  return rows[0] || null;
}

export async function touchLastLogin(studentId, db = defaultDb) {
  await db.query('UPDATE user_metadata SET last_login_at = now() WHERE id = $1', [studentId]);
}

// PUT /me/career. career_updated_at only moves when the career changes.
export async function setCareer(studentId, career, db = defaultDb) {
  const { rows } = await db.query(
    `UPDATE user_metadata
        SET career_updated_at = CASE WHEN current_career IS DISTINCT FROM $2 THEN now() ELSE career_updated_at END,
            current_career = $2
      WHERE id = $1 RETURNING *`,
    [studentId, career]);
  return rows[0];
}

// PUT /me and the class/board/city part of PUT /me/profile. Only the given
// keys change; a changed email is unverified again.
export async function setDetails(studentId, d, db = defaultDb) {
  const sets = [], params = [studentId];
  for (const col of ['city', 'class', 'board']) {
    if (col in d) { params.push(d[col]); sets.push(`${col} = $${params.length}`); }
  }
  if ('email' in d) {
    params.push(d.email);
    const p = `$${params.length}`;
    sets.push(`email_verified_at = CASE WHEN email IS NOT DISTINCT FROM ${p} THEN email_verified_at END`, `email = ${p}`);
  }
  if (!sets.length) return findById(studentId, db);
  const { rows } = await db.query(`UPDATE user_metadata SET ${sets.join(', ')} WHERE id = $1 RETURNING *`, params);
  return rows[0];
}

// Re-picks the institute each account shows: its school when it's on a
// school's list, else the first institute it registered through, else none.
export async function refreshInstitutes(studentIds, db = defaultDb) {
  if (!studentIds.length) return;
  await db.query(
    `UPDATE user_metadata m
        SET institute_id = p.id, institute_code = p.institute_code
       FROM (SELECT ids.id AS student_id, pick.id, pick.institute_code
               FROM unnest($1::int[]) AS ids (id)
               LEFT JOIN LATERAL (
                 SELECT i.id, i.institute_code
                   FROM "user" u JOIN institute i ON i.id = u.institute_id AND NOT i.is_deleted
                  WHERE u.metadata_id = ids.id
                  ORDER BY i.type = 'school' DESC, u.registered_at, i.id
                  LIMIT 1) pick ON true) p
      WHERE m.id = p.student_id
        AND (m.institute_id IS DISTINCT FROM p.id OR m.institute_code IS DISTINCT FROM p.institute_code)`,
    [studentIds]);
}

// For the access check: the institute the account shows, and the latest-
// ending subscription covering now on any list the student is on (from a
// live, active institute). Without one, a pilot place counts as the plan
// (020_pilot_mode.sql): a via_pilot row that has never been on a
// subscription, on an institute whose pilot is live, until the pilot ends.
// pending: the institute they've asked to join (join_requests), if any.
// on_list: on at least one live institute's list (else they're on none).
// Selected alongside user_metadata m LEFT JOIN institute i (ACCESS_FROM).
const ACCESS_FACTS = `
            i.name AS institute_name, i.type AS institute_type,
            coalesce(
              (SELECT row_to_json(x) FROM (
                 SELECT s.ends_at, li.name, li.institute_code
                   FROM "user" u
                   JOIN subscription s ON s.id = u.subscription_id
                   JOIN institute li ON li.id = u.institute_id AND li.status = 'active' AND NOT li.is_deleted
                  WHERE u.metadata_id = m.id AND now() >= s.starts_at AND now() < s.ends_at
                  ORDER BY s.ends_at DESC LIMIT 1) x),
              (SELECT row_to_json(x) FROM (
                 SELECT pi.pilot_ends_at AS ends_at, pi.name, pi.institute_code
                   FROM "user" u
                   JOIN institute pi ON pi.id = u.institute_id AND pi.status = 'active' AND NOT pi.is_deleted
                                    AND pi.pilot_mode AND now() < pi.pilot_ends_at
                  WHERE u.metadata_id = m.id AND u.via_pilot AND u.subscription_id IS NULL
                  ORDER BY pi.pilot_ends_at DESC LIMIT 1) x)) AS plan,
            (SELECT row_to_json(x) FROM (
               SELECT ri.name, ri.institute_code
                 FROM join_requests r
                 JOIN institute ri ON ri.id = r.institute_id AND NOT ri.is_deleted
                WHERE r.metadata_id = m.id
                ORDER BY r.created_at LIMIT 1) x) AS pending,
            EXISTS (SELECT 1 FROM "user" u JOIN institute oi ON oi.id = u.institute_id AND NOT oi.is_deleted
                     WHERE u.metadata_id = m.id) AS on_list`;
const ACCESS_FROM = 'user_metadata m LEFT JOIN institute i ON i.id = m.institute_id AND NOT i.is_deleted';

export async function findAccessFacts(studentId, db = defaultDb) {
  const { rows } = await db.query(
    `SELECT m.institute_code, ${ACCESS_FACTS} FROM ${ACCESS_FROM} WHERE m.id = $1`, [studentId]);
  return rows[0] || null;
}

// ── Admin panel ───────────────────────────────────────────────────────────
// A–Z, each account with its access facts. pattern is an ILIKE pattern on
// name, username, phone or email ('' for all). deactivated: only
// deactivated accounts (deleted or not), else deleted picks the tab.
export async function listForAdmin({ deleted, deactivated = false, pattern }, db = defaultDb) {
  const { rows } = await db.query(
    `SELECT m.*, ${ACCESS_FACTS} FROM ${ACCESS_FROM}
      WHERE (CASE WHEN $3 THEN m.deactivated_at IS NOT NULL ELSE m.is_deleted = $1 END)
        AND ($2 = '' OR m.name ILIKE $2 OR m.username ILIKE $2 OR m.phone_no ILIKE $2 OR m.email ILIKE $2)
      ORDER BY m.name, m.username`,
    [deleted, pattern, deactivated]);
  return rows;
}

// Live accounts and how many have access.
export async function countAccess(db = defaultDb) {
  const { rows } = await db.query(
    `WITH f AS (SELECT ${ACCESS_FACTS} FROM ${ACCESS_FROM} WHERE NOT m.is_deleted)
     SELECT count(*)::int AS students,
            count(*) FILTER (WHERE plan IS NOT NULL)::int AS students_with_access
       FROM f`);
  return rows[0];
}

// One account with its access facts, deleted or not, and the name of the
// admin who deactivated it. null when no such id.
export async function findForAdmin(studentId, db = defaultDb) {
  const { rows } = await db.query(
    `SELECT m.*, ${ACCESS_FACTS},
            (SELECT a.full_name FROM admins a WHERE a.id = m.deactivated_by) AS deactivated_by_name
       FROM ${ACCESS_FROM} WHERE m.id = $1`,
    [studentId]);
  return rows[0] || null;
}

// The account, locked for a change by an admin. null when no such id.
export async function findForUpdate(studentId, db = defaultDb) {
  const { rows } = await db.query('SELECT * FROM user_metadata WHERE id = $1 FOR UPDATE', [studentId]);
  return rows[0] || null;
}

// ── Deactivation (malpractice) ────────────────────────────────────────────
// Locks the account and ends every session. Its data stays.
export async function deactivate(studentId, { reason, note, adminId }, db = defaultDb) {
  await db.query(
    `UPDATE user_metadata
        SET deactivated_at = now(), deactivation_reason = $2, deactivation_note = $3, deactivated_by = $4
      WHERE id = $1`,
    [studentId, reason, note, adminId]);
  await db.query('DELETE FROM sessions WHERE student_id = $1', [studentId]);
}

export async function reactivate(studentId, db = defaultDb) {
  await db.query(
    `UPDATE user_metadata
        SET deactivated_at = NULL, deactivation_reason = NULL, deactivation_note = NULL, deactivated_by = NULL
      WHERE id = $1`,
    [studentId]);
}

// ── Name and phone, corrected by an admin ─────────────────────────────────
// Another account that is this person (name ignoring case + phone). null if none.
export async function findOtherByPerson(studentId, { name, phoneNo }, db = defaultDb) {
  const { rows } = await db.query(
    'SELECT id, username FROM user_metadata WHERE phone_no = $2 AND lower(name) = lower($3) AND id <> $1',
    [studentId, phoneNo, name]);
  return rows[0] || null;
}

// The account and every list row linked to it take the new name + phone.
export async function setPerson(studentId, { name, phoneNo }, db = defaultDb) {
  await db.query('UPDATE "user" SET name = $2, phone_no = $3 WHERE metadata_id = $1', [studentId, name, phoneNo]);
  await db.query('UPDATE user_metadata SET name = $2, phone_no = $3 WHERE id = $1', [studentId, name, phoneNo]);
}

export async function exists(studentId, db = defaultDb) {
  const { rows } = await db.query('SELECT 1 FROM user_metadata WHERE id = $1', [studentId]);
  return rows.length > 0;
}

// Soft delete also ends every session of that student (schema §7).
export async function softDelete(studentId, db = defaultDb) {
  await db.query(
    'UPDATE user_metadata SET is_deleted = true, deleted_at = coalesce(deleted_at, now()) WHERE id = $1', [studentId]);
  await db.query('DELETE FROM sessions WHERE student_id = $1', [studentId]);
}

// Replaces the password and signs them out everywhere.
export async function setPassword(studentId, passwordHash, db = defaultDb) {
  await db.query('UPDATE user_metadata SET password = $2 WHERE id = $1', [studentId, passwordHash]);
  await db.query('DELETE FROM sessions WHERE student_id = $1', [studentId]);
}

// Their list rows go back to unregistered, so they can register again;
// sessions, attempts, quiz runs and answers cascade.
export async function hardDelete(studentId, db = defaultDb) {
  await db.query(
    `UPDATE "user" SET metadata_id = NULL, status = 'unregistered', registered_at = NULL
      WHERE metadata_id = $1`,
    [studentId]);
  await db.query('DELETE FROM user_metadata WHERE id = $1', [studentId]);
}

export async function restore(studentId, db = defaultDb) {
  await db.query('UPDATE user_metadata SET is_deleted = false, deleted_at = NULL WHERE id = $1', [studentId]);
}

// ── Password reset links ──────────────────────────────────────────────────
// Stores a new link unless one was issued less than cooldownSeconds ago.
// false when held back by the cooldown.
export async function upsertResetLink({ studentId, tokenHash, email, lifetimeMinutes, cooldownSeconds }, db = defaultDb) {
  const { rowCount } = await db.query(
    `INSERT INTO student_reset_links (student_id, token_hash, email, expires_at)
     VALUES ($1, $2, $3, now() + make_interval(mins => $4))
     ON CONFLICT (student_id) DO UPDATE
       SET token_hash = EXCLUDED.token_hash, email = EXCLUDED.email,
           created_at = now(), expires_at = EXCLUDED.expires_at
       WHERE student_reset_links.created_at < now() - make_interval(secs => $5)`,
    [studentId, tokenHash, email, lifetimeMinutes, cooldownSeconds]);
  return rowCount > 0;
}

// The unexpired link for a live student, locked while it's used.
export async function findResetLink(tokenHash, db = defaultDb) {
  const { rows } = await db.query(
    `SELECT r.student_id, r.email
       FROM student_reset_links r JOIN user_metadata m ON m.id = r.student_id
      WHERE r.token_hash = $1 AND r.expires_at > now() AND NOT m.is_deleted AND m.deactivated_at IS NULL
      FOR UPDATE OF r`,
    [tokenHash]);
  return rows[0] || null;
}

// The link reached `email`, so it becomes the account's verified email.
export async function verifyEmail(studentId, email, db = defaultDb) {
  await db.query(
    'UPDATE user_metadata SET email = $2, email_verified_at = now() WHERE id = $1', [studentId, email]);
}

export async function deleteResetLink(studentId, db = defaultDb) {
  await db.query('DELETE FROM student_reset_links WHERE student_id = $1', [studentId]);
}

// A changed or removed email: links already sent to the old one must not
// confirm it or put it back (a reset link sets the email it was sent to).
export async function deleteEmailLinks(studentId, db = defaultDb) {
  await db.query('DELETE FROM student_reset_links WHERE student_id = $1', [studentId]);
  await db.query('DELETE FROM student_email_confirmations WHERE student_id = $1', [studentId]);
}

// ── Email confirmation links ──────────────────────────────────────────────
// Like upsertResetLink: false when held back by the cooldown.
export async function upsertConfirmLink({ studentId, tokenHash, email, lifetimeHours, cooldownSeconds }, db = defaultDb) {
  const { rowCount } = await db.query(
    `INSERT INTO student_email_confirmations (student_id, token_hash, email, expires_at)
     VALUES ($1, $2, $3, now() + make_interval(hours => $4))
     ON CONFLICT (student_id) DO UPDATE
       SET token_hash = EXCLUDED.token_hash, email = EXCLUDED.email,
           created_at = now(), expires_at = EXCLUDED.expires_at
       WHERE student_email_confirmations.created_at < now() - make_interval(secs => $5)
          OR student_email_confirmations.email IS DISTINCT FROM EXCLUDED.email`,
    [studentId, tokenHash, email, lifetimeHours, cooldownSeconds]);
  return rowCount > 0;
}

// The unexpired link, locked, with the account's current email. null when
// it's wrong, expired, or the account is deleted or deactivated.
export async function findConfirmLink(tokenHash, db = defaultDb) {
  const { rows } = await db.query(
    `SELECT c.student_id, c.email, m.email AS current_email
       FROM student_email_confirmations c JOIN user_metadata m ON m.id = c.student_id
      WHERE c.token_hash = $1 AND c.expires_at > now() AND NOT m.is_deleted AND m.deactivated_at IS NULL
      FOR UPDATE OF c`,
    [tokenHash]);
  return rows[0] || null;
}

export async function deleteConfirmLink(studentId, db = defaultDb) {
  await db.query('DELETE FROM student_email_confirmations WHERE student_id = $1', [studentId]);
}
