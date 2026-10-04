// Queries on school_roster, the student email list each school provides.
// Emails are matched case-insensitively; an email is on one school's list only.
import { db as defaultDb } from './db.js';

// A–Z, each with the live student registered under that email, if any.
export async function list(schoolId, db = defaultDb) {
  const { rows } = await db.query(
    `SELECT r.email, r.created_at, s.full_name, s.school_id AS student_school_id
       FROM school_roster r
       LEFT JOIN students s ON lower(s.email) = lower(r.email) AND NOT s.is_deleted
      WHERE r.school_id = $1
      ORDER BY lower(r.email)`,
    [schoolId]);
  return rows;
}

// Which of these (lower-case) emails are already on a list, and whose.
export async function findListed(emails, db = defaultDb) {
  const { rows } = await db.query(
    `SELECT lower(r.email) AS email, r.school_id, sc.name AS school_name
       FROM school_roster r JOIN schools sc ON sc.id = r.school_id
      WHERE lower(r.email) = ANY ($1::text[])`,
    [emails]);
  return rows;
}

// Returns the emails actually added; ones another upload added meanwhile are skipped.
export async function insertMany(schoolId, emails, adminId, db = defaultDb) {
  const { rows } = await db.query(
    `INSERT INTO school_roster (school_id, email, added_by)
     SELECT $1, e, $3 FROM unnest($2::text[]) AS e
     ON CONFLICT DO NOTHING
     RETURNING email`,
    [schoolId, emails, adminId]);
  return rows.map(r => r.email);
}

export async function remove(schoolId, email, db = defaultDb) {
  await db.query('DELETE FROM school_roster WHERE school_id = $1 AND lower(email) = lower($2)', [schoolId, email]);
}
