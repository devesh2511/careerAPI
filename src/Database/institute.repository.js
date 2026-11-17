// Queries on institute.
import { db as defaultDb } from './db.js';

// An institute students can register through: active and not deleted. Codes
// are stored upper-case.
export async function findJoinableByCode(instituteCode, db = defaultDb) {
  const { rows } = await db.query(
    `SELECT id, name, institute_code, type FROM institute
      WHERE institute_code = $1 AND status = 'active' AND NOT is_deleted`,
    [instituteCode]);
  return rows[0] || null;
}

// Name, code and type shown on a student's account. null once deleted.
export async function findRefById(instituteId, db = defaultDb) {
  const { rows } = await db.query(
    'SELECT name, institute_code, type FROM institute WHERE id = $1 AND NOT is_deleted', [instituteId]);
  return rows[0] || null;
}

// ── Admin panel ───────────────────────────────────────────────────────────
// Each institute with its list size, how many on it have registered, and
// its current subscription (else the latest one) for the InstituteDTO.
const ADMIN_SELECT = `
  SELECT i.*,
         (SELECT count(*)::int FROM "user" u WHERE u.institute_id = i.id) AS list_count,
         (SELECT count(*)::int FROM "user" u WHERE u.institute_id = i.id AND u.status = 'registered') AS registered_count,
         (SELECT row_to_json(x) FROM (
            SELECT s.id, now() >= s.starts_at AND now() < s.ends_at AS active, s.head_count,
                   s.starts_at, s.ends_at, s.payment_id IS NOT NULL AS paid
              FROM subscription s WHERE s.institute_id = i.id
             ORDER BY now() >= s.starts_at AND now() < s.ends_at DESC, s.ends_at DESC
             LIMIT 1) x) AS subscription
    FROM institute i`;

// A–Z. pattern is an ILIKE pattern on name, institute ID or city ('' for all).
export async function listForAdmin({ deleted, pattern }, db = defaultDb) {
  const { rows } = await db.query(
    `${ADMIN_SELECT}
      WHERE i.is_deleted = $1
        AND ($2 = '' OR i.name ILIKE $2 OR i.institute_code ILIKE $2 OR i.city ILIKE $2)
      ORDER BY i.name, i.id`,
    [deleted, pattern]);
  return rows;
}

// Deleted or not.
export async function findForAdmin(instituteId, db = defaultDb) {
  const { rows } = await db.query(`${ADMIN_SELECT} WHERE i.id = $1`, [instituteId]);
  return rows[0] || null;
}

export async function exists(instituteId, db = defaultDb) {
  const { rows } = await db.query('SELECT 1 FROM institute WHERE id = $1', [instituteId]);
  return rows.length > 0;
}

// A taken institute ID surfaces as 23505 on institute_institute_code_key.
export async function insert(s, adminId, db = defaultDb) {
  const { rows } = await db.query(
    `INSERT INTO institute (institute_code, type, name, address, city, contact_details, status, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [s.institute_code, s.type, s.name, s.address, s.city, s.contact_details, s.status, adminId]);
  return rows[0].id;
}

// The accounts that show this institute get its new code too.
export async function update(instituteId, s, db = defaultDb) {
  const { rowCount } = await db.query(
    `UPDATE institute SET institute_code = $2, type = $3, name = $4, address = $5, city = $6,
                          contact_details = $7, status = $8
      WHERE id = $1`,
    [instituteId, s.institute_code, s.type, s.name, s.address, s.city, s.contact_details, s.status]);
  if (rowCount) {
    await db.query('UPDATE user_metadata SET institute_code = $2 WHERE institute_id = $1', [instituteId, s.institute_code]);
  }
  return rowCount > 0;
}

// Its subscriptions stop counting in the access check; the list is kept.
export async function softDelete(instituteId, db = defaultDb) {
  await db.query(
    'UPDATE institute SET is_deleted = true, deleted_at = coalesce(deleted_at, now()) WHERE id = $1', [instituteId]);
}

// The list and subscriptions cascade; payments keep their rows with
// institute_id = NULL; accounts keep existing (the service re-picks the
// institute they show).
export async function hardDelete(instituteId, db = defaultDb) {
  await db.query('DELETE FROM institute WHERE id = $1', [instituteId]);
}

export async function restore(instituteId, db = defaultDb) {
  await db.query('UPDATE institute SET is_deleted = false, deleted_at = NULL WHERE id = $1', [instituteId]);
}

// Live institutes, and how many have a subscription covering now.
export async function countPaying(db = defaultDb) {
  const { rows } = await db.query(
    `SELECT count(*)::int AS institutes,
            count(*) FILTER (WHERE EXISTS (
              SELECT 1 FROM subscription s
               WHERE s.institute_id = i.id AND now() >= s.starts_at AND now() < s.ends_at))::int AS institutes_paying
       FROM institute i WHERE NOT i.is_deleted`);
  return rows[0];
}
