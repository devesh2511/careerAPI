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

// For the access check (schema §6.4): the student's school, whether their
// email is on its list, and the best active individual and school plans.
export async function findAccessFacts(studentId, db = defaultDb) {
  const { rows } = await db.query(
    `SELECT s.school_id,
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
                ORDER BY ends_at DESC LIMIT 1) x) AS school_plan
       FROM students s
       LEFT JOIN schools sc ON sc.id = s.school_id AND NOT sc.is_deleted
      WHERE s.id = $1`,
    [studentId]);
  return rows[0] || null;
}
