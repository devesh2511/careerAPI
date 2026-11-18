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

// ── Matching uploads to accounts, and one school per student ──────────────
// entries: [{ name, phoneNo }] from an upload. For each (same order): the
// account it is, by current name + phone first, else by old details
// (student_aliases). { studentId, name, phoneNo, by: 'current' | 'alias',
// deactivated } with the account's current details, { ambiguous: true } when
// old details fit more than one account, or null.
export async function matchAccounts(entries, db = defaultDb) {
  if (!entries.length) return [];
  const { rows } = await db.query(
    `SELECT e.i::int AS i, cur.id AS cur_id,
            (SELECT array_agg(DISTINCT a.student_id) FROM student_aliases a
              WHERE a.phone_no = e.phone_no AND lower(a.name) = lower(e.name)) AS alias_ids
       FROM unnest($1::text[], $2::text[]) WITH ORDINALITY AS e (name, phone_no, i)
       LEFT JOIN user_metadata cur ON cur.phone_no = e.phone_no AND lower(cur.name) = lower(e.name)`,
    [entries.map(e => e.name), entries.map(e => e.phoneNo)]);
  const pick = rows.map(r => (r.cur_id ? { id: r.cur_id, by: 'current' }
    : r.alias_ids && r.alias_ids.length === 1 ? { id: r.alias_ids[0], by: 'alias' }
      : r.alias_ids && r.alias_ids.length > 1 ? { ambiguous: true } : null));
  const ids = [...new Set(pick.filter(p => p && p.id).map(p => p.id))];
  const { rows: accounts } = ids.length
    ? await db.query('SELECT id, name, phone_no, deactivated_at FROM user_metadata WHERE id = ANY($1::int[])', [ids])
    : { rows: [] };
  const byId = new Map(accounts.map(a => [a.id, a]));
  const out = new Array(entries.length).fill(null);
  rows.forEach((r, k) => {
    const p = pick[k];
    if (!p) return;
    if (p.ambiguous) { out[r.i - 1] = { ambiguous: true }; return; }
    const a = byId.get(p.id);
    out[r.i - 1] = { studentId: a.id, name: a.name, phoneNo: a.phone_no, by: p.by, deactivated: Boolean(a.deactivated_at) };
  });
  return out;
}

// Links unlinked rows of this institute's list to these accounts.
// links: [{ name, phoneNo, studentId }]. → the account ids linked.
export async function linkMany(instituteId, links, db = defaultDb) {
  if (!links.length) return [];
  const { rows } = await db.query(
    `UPDATE "user" u SET metadata_id = l.student_id, status = 'registered', registered_at = now()
       FROM unnest($2::text[], $3::text[], $4::int[]) AS l (name, phone_no, student_id)
      WHERE u.institute_id = $1 AND u.phone_no = l.phone_no AND lower(u.name) = lower(l.name)
        AND u.metadata_id IS NULL
     RETURNING u.metadata_id`,
    [instituteId, links.map(l => l.name), links.map(l => l.phoneNo), links.map(l => l.studentId)]);
  return rows.map(r => r.metadata_id);
}

// Rows on other schools' lists (deleted schools too) that are these people:
// same name + phone as an entry, or linked to one of these accounts. Locked.
// covered_now: on a subscription covering today.
export async function otherSchoolRows(instituteId, entries, studentIds, db = defaultDb) {
  const { rows } = await db.query(
    `SELECT u.institute_id, u.name, u.phone_no, u.metadata_id,
            i.name AS institute_name, i.institute_code,
            s.id IS NOT NULL AND now() >= s.starts_at AND now() < s.ends_at AS covered_now
       FROM "user" u
       JOIN institute i ON i.id = u.institute_id AND i.type = 'school'
       LEFT JOIN subscription s ON s.id = u.subscription_id
      WHERE u.institute_id <> $1
        AND (u.metadata_id = ANY($4::int[])
             OR (u.phone_no, lower(u.name)) IN (SELECT e.phone_no, lower(e.name)
                                                  FROM unnest($2::text[], $3::text[]) AS e (name, phone_no)))
      FOR UPDATE OF u`,
    [instituteId, entries.map(e => e.name), entries.map(e => e.phoneNo), studentIds]);
  return rows;
}

// Deletes these rows: [{ institute_id, name, phone_no }].
export async function removeRows(rowsToRemove, db = defaultDb) {
  if (!rowsToRemove.length) return;
  await db.query(
    `DELETE FROM "user" u
      USING unnest($1::int[], $2::text[], $3::text[]) AS r (institute_id, name, phone_no)
      WHERE u.institute_id = r.institute_id AND u.phone_no = r.phone_no AND lower(u.name) = lower(r.name)`,
    [rowsToRemove.map(r => r.institute_id), rowsToRemove.map(r => r.name), rowsToRemove.map(r => r.phone_no)]);
}

// Links every unlinked row, on any list, that is this person (their name +
// phone) to the account. → the institute ids now linked.
export async function claimAllFor(studentId, { name, phoneNo }, db = defaultDb) {
  const { rows } = await db.query(
    `UPDATE "user" SET metadata_id = $1, status = 'registered', registered_at = now()
      WHERE phone_no = $2 AND lower(name) = lower($3) AND metadata_id IS NULL
     RETURNING institute_id`,
    [studentId, phoneNo, name]);
  return rows.map(r => r.institute_id);
}

// The account's rows on school lists (deleted schools too), most recently
// uploaded first (subscription creation, else when the row was added), plus
// unlinked school rows with its name + phone. Locked.
export async function schoolRowsFor(studentId, db = defaultDb) {
  const { rows } = await db.query(
    `SELECT u.institute_id, u.name, u.phone_no, u.metadata_id, i.name AS institute_name, i.institute_code
       FROM user_metadata m
       JOIN "user" u ON u.metadata_id = m.id OR (u.metadata_id IS NULL AND u.phone_no = m.phone_no AND lower(u.name) = lower(m.name))
       JOIN institute i ON i.id = u.institute_id AND i.type = 'school'
       LEFT JOIN subscription s ON s.id = u.subscription_id
      WHERE m.id = $1
      ORDER BY u.metadata_id IS NOT NULL DESC,
               greatest(u.created_at, coalesce(s.created_at, u.created_at)) DESC, u.institute_id DESC
      FOR UPDATE OF u`,
    [studentId]);
  return rows;
}

// Is anyone on this institute's list also on another school's list?
// → how many such people.
export async function countOnOtherSchools(instituteId, db = defaultDb) {
  const { rows } = await db.query(
    `SELECT count(DISTINCT (u.phone_no, lower(u.name)))::int AS n
       FROM "user" u
       JOIN "user" o ON o.phone_no = u.phone_no AND lower(o.name) = lower(u.name) AND o.institute_id <> u.institute_id
       JOIN institute oi ON oi.id = o.institute_id AND oi.type = 'school'
      WHERE u.institute_id = $1`,
    [instituteId]);
  return rows[0].n;
}

// Before an account takes new details: unlinked rows with those details on a
// list the account is already on are the same person, so they go. The
// linked row keeps whichever of the two subscriptions ends later.
export async function mergeUnlinkedInto(studentId, { name, phoneNo }, db = defaultDb) {
  const { rows } = await db.query(
    `SELECT d.institute_id, d.name, d.phone_no, d.subscription_id AS dup_sub, ds.ends_at AS dup_ends,
            u.name AS own_name, u.phone_no AS own_phone, us.ends_at AS own_ends
       FROM "user" u
       JOIN "user" d ON d.institute_id = u.institute_id AND d.metadata_id IS NULL
                    AND d.phone_no = $2 AND lower(d.name) = lower($3)
       LEFT JOIN subscription ds ON ds.id = d.subscription_id
       LEFT JOIN subscription us ON us.id = u.subscription_id
      WHERE u.metadata_id = $1
      FOR UPDATE OF u, d`,
    [studentId, phoneNo, name]);
  for (const r of rows) {
    await db.query('DELETE FROM "user" WHERE institute_id = $1 AND phone_no = $2 AND name = $3',
      [r.institute_id, r.phone_no, r.name]);
    if (r.dup_sub && (!r.own_ends || r.dup_ends > r.own_ends)) {
      await db.query('UPDATE "user" SET subscription_id = $2 WHERE institute_id = $1 AND metadata_id = $3',
        [r.institute_id, r.dup_sub, studentId]);
    }
  }
}
