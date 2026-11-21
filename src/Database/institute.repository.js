// Queries on institute.
import { db as defaultDb } from './db.js';

// An institute students can register through: active and not deleted. Codes
// are stored upper-case. accepts_requests: students not on its list may ask
// to join (join_requests) instead of being turned away. pilot_live: its pilot
// is running (020_pilot_mode.sql), so students not on its list can take a
// pilot seat. forUpdate locks the row until the transaction ends (pilot
// sign-ups lock it so two can't take the last seat).
export async function findJoinableByCode(instituteCode, db = defaultDb, { forUpdate = false } = {}) {
  const { rows } = await db.query(
    `SELECT id, name, institute_code, type, accepts_requests,
            pilot_mode AND now() < pilot_ends_at AS pilot_live, pilot_seats_class9, pilot_seats_class10
       FROM institute
      WHERE institute_code = $1 AND status = 'active' AND NOT is_deleted${forUpdate ? ' FOR UPDATE' : ''}`,
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
         (SELECT count(*)::int FROM join_requests r WHERE r.institute_id = i.id) AS pending_count,
         i.pilot_mode AND now() < i.pilot_ends_at AND i.status = 'active' AND NOT i.is_deleted AS pilot_live,
         (SELECT count(*) FILTER (WHERE u.pilot_class = 9)::int FROM "user" u
            JOIN user_metadata m ON m.id = u.metadata_id AND NOT m.is_deleted
           WHERE u.institute_id = i.id AND u.via_pilot AND u.subscription_id IS NULL) AS pilot_used_class9,
         (SELECT count(*) FILTER (WHERE u.pilot_class = 10)::int FROM "user" u
            JOIN user_metadata m ON m.id = u.metadata_id AND NOT m.is_deleted
           WHERE u.institute_id = i.id AND u.via_pilot AND u.subscription_id IS NULL) AS pilot_used_class10,
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
    `INSERT INTO institute (institute_code, type, name, address, city, contact_details, status, created_by, accepts_requests,
                            pilot_mode, pilot_ends_at, pilot_seats_class9, pilot_seats_class10)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, coalesce($12, 5), coalesce($13, 5)) RETURNING id`,
    [s.institute_code, s.type, s.name, s.address, s.city, s.contact_details, s.status, adminId, s.accepts_requests ?? false,
      s.pilot_mode ?? false, s.pilot_ends_at ?? null, s.pilot_seats_class9 ?? null, s.pilot_seats_class10 ?? null]);
  return rows[0].id;
}

// The accounts that show this institute get its new code too. An omitted
// accepts_requests or pilot field (undefined) keeps the current setting.
export async function update(instituteId, s, db = defaultDb) {
  const { rowCount } = await db.query(
    `UPDATE institute SET institute_code = $2, type = $3, name = $4, address = $5, city = $6,
                          contact_details = $7, status = $8, accepts_requests = coalesce($9, accepts_requests),
                          pilot_mode = coalesce($10, pilot_mode), pilot_ends_at = coalesce($11, pilot_ends_at),
                          pilot_seats_class9 = coalesce($12, pilot_seats_class9),
                          pilot_seats_class10 = coalesce($13, pilot_seats_class10)
      WHERE id = $1`,
    [instituteId, s.institute_code, s.type, s.name, s.address, s.city, s.contact_details, s.status,
      s.accepts_requests ?? null, s.pilot_mode ?? null, s.pilot_ends_at ?? null,
      s.pilot_seats_class9 ?? null, s.pilot_seats_class10 ?? null]);
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
