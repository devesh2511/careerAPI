// Queries on students and auth_identities.
import { db as defaultDb } from './db.js';

// Inserts a student. A duplicate email surfaces as Postgres error 23505 on
// the students_email_key index; the service turns that into email_taken.
export async function insertStudent({ email, fullName, schoolId }, db = defaultDb) {
  const { rows } = await db.query(
    'INSERT INTO students (email, full_name, school_id) VALUES ($1, $2, $3) RETURNING *',
    [email, fullName, schoolId]);
  return rows[0];
}

export async function insertPasswordIdentity({ studentId, email, passwordHash }, db = defaultDb) {
  await db.query(
    `INSERT INTO auth_identities (student_id, provider, provider_subject, password_hash, last_login_at)
     VALUES ($1, 'password', $2, $3, now())`,
    [studentId, email, passwordHash]);
}

// The student behind a password login, deleted or not (the service decides),
// with the identity's id and hash. null when no such email.
export async function findPasswordLogin(email, db = defaultDb) {
  const { rows } = await db.query(
    `SELECT s.*, ai.id AS identity_id, ai.password_hash
       FROM auth_identities ai JOIN students s ON s.id = ai.student_id
      WHERE ai.provider = 'password' AND ai.provider_subject = $1`,
    [email]);
  return rows[0] || null;
}

export async function touchLastLogin(identityId, db = defaultDb) {
  await db.query('UPDATE auth_identities SET last_login_at = now() WHERE id = $1', [identityId]);
}

// PUT /me/career. career_updated_at only moves when the career changes.
export async function setCareer(studentId, career, db = defaultDb) {
  const { rows } = await db.query(
    `UPDATE students
        SET career_updated_at = CASE WHEN current_career IS DISTINCT FROM $2 THEN now() ELSE career_updated_at END,
            current_career = $2
      WHERE id = $1 RETURNING *`,
    [studentId, career]);
  return rows[0];
}

// For the access check (schema §6.4): the student's school, whether their
// email is on its list, and the best active individual and school plans.
// Selected alongside students s LEFT JOIN schools sc (ACCESS_FROM).
const ACCESS_FACTS = `
            s.school_id,
            sc.name, sc.school_code,
            sc.status = 'active' AS school_live,
            EXISTS (SELECT 1 FROM school_roster r
                     WHERE r.school_id = s.school_id AND lower(r.email) = lower(s.email)) AS on_roster,
            (SELECT row_to_json(x) FROM (
               SELECT plan, ends_at FROM subscriptions
                WHERE student_id = s.id AND status = 'active'
                  AND now() >= starts_at AND now() < ends_at
                ORDER BY ends_at DESC LIMIT 1) x) AS own_plan,
            (SELECT row_to_json(x) FROM (
               SELECT plan, ends_at FROM subscriptions
                WHERE school_id = s.school_id AND status = 'active'
                  AND now() >= starts_at AND now() < ends_at
                ORDER BY ends_at DESC LIMIT 1) x) AS school_plan`;
const ACCESS_FROM = 'students s LEFT JOIN schools sc ON sc.id = s.school_id AND NOT sc.is_deleted';

export async function findAccessFacts(studentId, db = defaultDb) {
  const { rows } = await db.query(`SELECT ${ACCESS_FACTS} FROM ${ACCESS_FROM} WHERE s.id = $1`, [studentId]);
  return rows[0] || null;
}

// ── Admin panel ───────────────────────────────────────────────────────────
// A–Z, each student row with its access facts. pattern is an ILIKE pattern
// on name or email ('' for all).
export async function listForAdmin({ deleted, pattern }, db = defaultDb) {
  const { rows } = await db.query(
    `SELECT s.*, ${ACCESS_FACTS} FROM ${ACCESS_FROM}
      WHERE s.is_deleted = $1 AND ($2 = '' OR s.full_name ILIKE $2 OR s.email ILIKE $2)
      ORDER BY s.full_name, s.email`,
    [deleted, pattern]);
  return rows;
}

// Live students, how many have access, and how many through their school —
// the access check (schema §6.4) for everyone at once. A student covered both
// ways counts as via school, as accessFor() reports it.
export async function countAccess(db = defaultDb) {
  const { rows } = await db.query(
    `WITH f AS (SELECT ${ACCESS_FACTS} FROM ${ACCESS_FROM} WHERE NOT s.is_deleted),
          a AS (SELECT coalesce(name IS NOT NULL AND school_live AND on_roster AND school_plan IS NOT NULL, false) AS via_school,
                       own_plan IS NOT NULL AS own FROM f)
     SELECT count(*)::int AS students,
            count(*) FILTER (WHERE via_school OR own)::int AS students_with_access,
            count(*) FILTER (WHERE via_school)::int AS students_via_school
       FROM a`);
  return rows[0];
}

// One student with their access facts, deleted or not. null when no such id.
export async function findForAdmin(studentId, db = defaultDb) {
  const { rows } = await db.query(`SELECT s.*, ${ACCESS_FACTS} FROM ${ACCESS_FROM} WHERE s.id = $1`, [studentId]);
  return rows[0] || null;
}

// PUT /me/school; null clears it.
export async function setSchool(studentId, schoolId, db = defaultDb) {
  const { rows } = await db.query('UPDATE students SET school_id = $2 WHERE id = $1 RETURNING *', [studentId, schoolId]);
  return rows[0];
}

export async function exists(studentId, db = defaultDb) {
  const { rows } = await db.query('SELECT 1 FROM students WHERE id = $1', [studentId]);
  return rows.length > 0;
}

// Soft delete also ends every session of that student (schema §7).
export async function softDelete(studentId, db = defaultDb) {
  await db.query(
    'UPDATE students SET is_deleted = true, deleted_at = coalesce(deleted_at, now()) WHERE id = $1', [studentId]);
  await db.query('DELETE FROM sessions WHERE student_id = $1', [studentId]);
}

// Replaces the student's login password and signs them out everywhere.
// false when the student has no password login.
export async function setPassword(studentId, passwordHash, db = defaultDb) {
  const { rowCount } = await db.query(
    "UPDATE auth_identities SET password_hash = $2 WHERE student_id = $1 AND provider = 'password'",
    [studentId, passwordHash]);
  if (!rowCount) return false;
  await db.query('DELETE FROM sessions WHERE student_id = $1', [studentId]);
  return true;
}

// Logins and sessions cascade; their payments are kept with student_id = NULL.
export async function hardDelete(studentId, db = defaultDb) {
  await db.query('DELETE FROM students WHERE id = $1', [studentId]);
}

export async function restore(studentId, db = defaultDb) {
  await db.query('UPDATE students SET is_deleted = false, deleted_at = NULL WHERE id = $1', [studentId]);
}
