// Queries on schools.
import { db as defaultDb } from './db.js';

// A school students can join: active and not deleted. Codes are stored upper-case.
export async function findJoinableByCode(schoolCode, db = defaultDb) {
  const { rows } = await db.query(
    `SELECT id, name, school_code FROM schools
      WHERE school_code = $1 AND status = 'active' AND NOT is_deleted`,
    [schoolCode]);
  return rows[0] || null;
}

// Name and School ID shown on a student's account. null once deleted.
export async function findRefById(schoolId, db = defaultDb) {
  const { rows } = await db.query(
    'SELECT name, school_code FROM schools WHERE id = $1 AND NOT is_deleted', [schoolId]);
  return rows[0] || null;
}

// ── Admin panel ───────────────────────────────────────────────────────────
// Each school with its list size, its live students, and its current plan
// (else the latest one) for the SchoolDTO.
const ADMIN_SELECT = `
  SELECT sc.*,
         (SELECT count(*)::int FROM school_roster r WHERE r.school_id = sc.id) AS roster_count,
         (SELECT count(*)::int FROM students s WHERE s.school_id = sc.id AND NOT s.is_deleted) AS student_count,
         (SELECT row_to_json(x) FROM (
            SELECT now() >= p.starts_at AND now() < p.ends_at AS active, p.plan, p.ends_at
              FROM subscriptions p WHERE p.school_id = sc.id AND p.status = 'active'
             ORDER BY now() >= p.starts_at AND now() < p.ends_at DESC, p.ends_at DESC
             LIMIT 1) x) AS subscription
    FROM schools sc`;

// A–Z. pattern is an ILIKE pattern on name, School ID or city ('' for all).
export async function listForAdmin({ deleted, pattern }, db = defaultDb) {
  const { rows } = await db.query(
    `${ADMIN_SELECT}
      WHERE sc.is_deleted = $1
        AND ($2 = '' OR sc.name ILIKE $2 OR sc.school_code ILIKE $2 OR sc.city ILIKE $2)
      ORDER BY sc.name, sc.id`,
    [deleted, pattern]);
  return rows;
}

// Deleted or not.
export async function findForAdmin(schoolId, db = defaultDb) {
  const { rows } = await db.query(`${ADMIN_SELECT} WHERE sc.id = $1`, [schoolId]);
  return rows[0] || null;
}

export async function exists(schoolId, db = defaultDb) {
  const { rows } = await db.query('SELECT 1 FROM schools WHERE id = $1', [schoolId]);
  return rows.length > 0;
}

// A taken School ID or UDISE+ code surfaces as 23505 on
// schools_school_code_key / schools_udise_code_key.
export async function insert(s, adminId, db = defaultDb) {
  const { rows } = await db.query(
    `INSERT INTO schools (name, school_code, udise_code, board, city, state, status,
                          contact_name, contact_email, contact_phone, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
    [s.name, s.school_code, s.udise_code, s.board, s.city, s.state, s.status,
     s.contact_name, s.contact_email, s.contact_phone, adminId]);
  return rows[0].id;
}

export async function update(schoolId, s, db = defaultDb) {
  const { rowCount } = await db.query(
    `UPDATE schools SET name = $2, school_code = $3, udise_code = $4, board = $5, city = $6, state = $7,
                        status = $8, contact_name = $9, contact_email = $10, contact_phone = $11
      WHERE id = $1`,
    [schoolId, s.name, s.school_code, s.udise_code, s.board, s.city, s.state, s.status,
     s.contact_name, s.contact_email, s.contact_phone]);
  return rowCount > 0;
}

// Its plans stop counting in the access check; the list is kept.
export async function softDelete(schoolId, db = defaultDb) {
  await db.query(
    'UPDATE schools SET is_deleted = true, deleted_at = coalesce(deleted_at, now()) WHERE id = $1', [schoolId]);
}

// The list cascades; subscriptions and students keep their rows with school_id = NULL.
export async function hardDelete(schoolId, db = defaultDb) {
  await db.query('DELETE FROM schools WHERE id = $1', [schoolId]);
}

export async function restore(schoolId, db = defaultDb) {
  await db.query('UPDATE schools SET is_deleted = false, deleted_at = NULL WHERE id = $1', [schoolId]);
}

// Live schools, and how many have an active plan covering now.
export async function countPaying(db = defaultDb) {
  const { rows } = await db.query(
    `SELECT count(*)::int AS schools,
            count(*) FILTER (WHERE EXISTS (
              SELECT 1 FROM subscriptions p
               WHERE p.school_id = sc.id AND p.status = 'active'
                 AND now() >= p.starts_at AND now() < p.ends_at))::int AS schools_paying
       FROM schools sc WHERE NOT sc.is_deleted`);
  return rows[0];
}
