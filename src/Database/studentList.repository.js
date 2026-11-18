// Queries on "user": each institute's student list, one row per student per
// institute, keyed by (institute_id, name, phone_no). Names match ignoring
// case (the user_person_key index). "user" is a reserved word: keep it quoted.
import { db as defaultDb } from './db.js';

// The list A–Z, each row with the account it's linked to and its subscription.
export async function list(instituteId, db = defaultDb) {
  const { rows } = await db.query(
    `SELECT u.name, u.phone_no, u.status, u.registered_at, u.created_at,
            m.id AS student_id, m.username,
            s.id AS subscription_id, s.ends_at AS subscription_ends_at,
            s.id IS NOT NULL AND now() >= s.starts_at AND now() < s.ends_at AS subscription_active
       FROM "user" u
       LEFT JOIN user_metadata m ON m.id = u.metadata_id
       LEFT JOIN subscription s ON s.id = u.subscription_id
      WHERE u.institute_id = $1
      ORDER BY lower(u.name), u.phone_no`,
    [instituteId]);
  return rows;
}

// One row, locked so a concurrent registration waits. null when not on the list.
export async function findForUpdate({ instituteId, name, phoneNo }, db = defaultDb) {
  const { rows } = await db.query(
    `SELECT * FROM "user"
      WHERE institute_id = $1 AND phone_no = $2 AND lower(name) = lower($3)
      FOR UPDATE`,
    [instituteId, phoneNo, name]);
  return rows[0] || null;
}

// Links the row to an account. false when someone else linked it first.
export async function claim({ instituteId, name, phoneNo, studentId }, db = defaultDb) {
  const { rowCount } = await db.query(
    `UPDATE "user" SET metadata_id = $4, status = 'registered', registered_at = now()
      WHERE institute_id = $1 AND phone_no = $2 AND lower(name) = lower($3) AND metadata_id IS NULL`,
    [instituteId, phoneNo, name, studentId]);
  return rowCount > 0;
}

// An approved join request: puts the account on the list, registered, on
// this subscription. If the admin uploaded them meanwhile, that row is
// linked instead (keeping its subscription, if it has one).
export async function addRegistered({ instituteId, name, phoneNo, studentId, subscriptionId, adminId }, db = defaultDb) {
  await db.query(
    `INSERT INTO "user" (institute_id, name, phone_no, status, subscription_id, metadata_id, registered_at, added_by)
     VALUES ($1, $2, $3, 'registered', $4, $5, now(), $6)
     ON CONFLICT (institute_id, phone_no, lower(name)) DO UPDATE
       SET metadata_id = EXCLUDED.metadata_id, status = 'registered',
           registered_at = coalesce("user".registered_at, now()),
           subscription_id = coalesce("user".subscription_id, EXCLUDED.subscription_id)`,
    [instituteId, name, phoneNo, subscriptionId, studentId, adminId]);
}

// Adds the rows to the list on this subscription. Rows already on the list
// (a renewal) move to it instead. → { added, renewed } counts.
export async function upsertMany(instituteId, entries, subscriptionId, adminId, db = defaultDb) {
  const { rows } = await db.query(
    `INSERT INTO "user" (institute_id, name, phone_no, subscription_id, added_by)
     SELECT $1, e.name, e.phone_no, $4, $5
       FROM unnest($2::text[], $3::text[]) AS e (name, phone_no)
     ON CONFLICT (institute_id, phone_no, lower(name)) DO UPDATE
       SET subscription_id = EXCLUDED.subscription_id
     RETURNING (xmax = 0) AS inserted`,
    [instituteId, entries.map(e => e.name), entries.map(e => e.phoneNo), subscriptionId, adminId]);
  const added = rows.filter(r => r.inserted).length;
  return { added, renewed: rows.length - added };
}

// Removes one row. Returns the account it was linked to (null if none), or
// undefined when there was no such row.
export async function remove({ instituteId, name, phoneNo }, db = defaultDb) {
  const { rows } = await db.query(
    `DELETE FROM "user" WHERE institute_id = $1 AND phone_no = $2 AND lower(name) = lower($3)
     RETURNING metadata_id`,
    [instituteId, phoneNo, name]);
  return rows.length ? rows[0].metadata_id : undefined;
}

// The accounts linked to any row on this institute's list.
export async function linkedAccounts(instituteId, db = defaultDb) {
  const { rows } = await db.query(
    'SELECT DISTINCT metadata_id FROM "user" WHERE institute_id = $1 AND metadata_id IS NOT NULL', [instituteId]);
  return rows.map(r => r.metadata_id);
}

// The institutes an account is on, for the admin's student page.
export async function forAccount(studentId, db = defaultDb) {
  const { rows } = await db.query(
    `SELECT i.id, i.name, i.institute_code, i.type, i.is_deleted, u.registered_at,
            s.ends_at AS subscription_ends_at,
            s.id IS NOT NULL AND now() >= s.starts_at AND now() < s.ends_at AS subscription_active
       FROM "user" u
       JOIN institute i ON i.id = u.institute_id
       LEFT JOIN subscription s ON s.id = u.subscription_id
      WHERE u.metadata_id = $1
      ORDER BY u.registered_at`,
    [studentId]);
  return rows;
}

// Is this account on the list of the institute with this code? (Proof for
// adding an email at password reset.)
export async function isOnListOf(studentId, instituteCode, db = defaultDb) {
  const { rows } = await db.query(
    `SELECT 1 FROM "user" u JOIN institute i ON i.id = u.institute_id
      WHERE u.metadata_id = $1 AND i.institute_code = $2 AND NOT i.is_deleted`,
    [studentId, instituteCode]);
  return rows.length > 0;
}

// How many of these rows are on a subscription covering now. A renewal that
// starts later must not move them yet: they'd lose access until it starts.
export async function countCoveredNow(instituteId, entries, db = defaultDb) {
  const { rows } = await db.query(
    `SELECT count(*)::int AS n
       FROM unnest($2::text[], $3::text[]) AS e (name, phone_no)
       JOIN "user" u ON u.institute_id = $1 AND u.phone_no = e.phone_no AND lower(u.name) = lower(e.name)
       JOIN subscription s ON s.id = u.subscription_id
      WHERE now() >= s.starts_at AND now() < s.ends_at`,
    [instituteId, entries.map(e => e.name), entries.map(e => e.phoneNo)]);
  return rows[0].n;
}
