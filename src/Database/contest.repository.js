// Queries on contests and contest_questions, for the admin panel.
// upcoming/open/closed and locked are not stored: they come from now().
import { db as defaultDb } from './db.js';

const SELECT = `
  SELECT c.id, c.opens_at, c.closes_at, c.status, c.scored_at,
         CASE WHEN now() < c.opens_at THEN 'upcoming'
              WHEN now() < c.closes_at THEN 'open'
              ELSE 'closed' END AS state,
         c.opens_at <= now() AS locked,
         (SELECT count(*)::int FROM contest_questions q WHERE q.contest_id = c.id) AS question_count,
         a.full_name AS created_by, c.is_deleted, c.deleted_at, c.created_at
    FROM contests c LEFT JOIN admins a ON a.id = c.created_by`;

// Newest first.
export async function list(deleted, db = defaultDb) {
  const { rows } = await db.query(`${SELECT} WHERE c.is_deleted = $1 ORDER BY c.opens_at DESC`, [deleted]);
  return rows;
}

// Deleted or not; the admin can still open a soft-deleted contest.
export async function find(contestId, db = defaultDb) {
  const { rows } = await db.query(`${SELECT} WHERE c.id = $1`, [contestId]);
  return rows[0] || null;
}

// Live contests that haven't closed, soonest first.
export async function listNotClosed(limit, db = defaultDb) {
  const { rows } = await db.query(
    `${SELECT} WHERE NOT c.is_deleted AND c.closes_at > now() ORDER BY c.opens_at LIMIT $1`, [limit]);
  return rows;
}

export async function listDrafts(db = defaultDb) {
  const { rows } = await db.query(
    `${SELECT} WHERE NOT c.is_deleted AND c.status = 'draft' ORDER BY c.opens_at`);
  return rows;
}

export async function questions(contestId, db = defaultDb) {
  const { rows } = await db.query(
    `SELECT id, position, area, text, options, correct_index, explanation
       FROM contest_questions WHERE contest_id = $1 ORDER BY position`,
    [contestId]);
  return rows;
}

// Locks the contest row for the rest of the transaction, so a question save
// and a schedule can't interleave. null when there's no such contest.
export async function lockForEdit(contestId, db = defaultDb) {
  const { rows } = await db.query(
    `SELECT id, opens_at <= now() AS locked,
            (SELECT count(*)::int FROM contest_questions q WHERE q.contest_id = contests.id) AS question_count
       FROM contests WHERE id = $1 FOR UPDATE`,
    [contestId]);
  return rows[0] || null;
}

// An overlapping live contest surfaces as 23P01 on contests_no_overlap.
export async function insert({ opensAt, adminId }, db = defaultDb) {
  const { rows } = await db.query(
    `INSERT INTO contests (opens_at, closes_at, created_by)
     VALUES ($1, $1::timestamptz + interval '36 hours', $2) RETURNING id`,
    [opensAt, adminId]);
  return rows[0].id;
}

export async function upsertQuestion(contestId, q, db = defaultDb) {
  await db.query(
    `INSERT INTO contest_questions (id, contest_id, position, area, text, options, correct_index, explanation)
     VALUES ('c' || $1::int || '-q' || $2::int, $1::int, $2::int, $3, $4, $5, $6, $7)
     ON CONFLICT (contest_id, position) DO UPDATE
       SET area = EXCLUDED.area, text = EXCLUDED.text, options = EXCLUDED.options,
           correct_index = EXCLUDED.correct_index, explanation = EXCLUDED.explanation`,
    [contestId, q.position, q.area, q.text, q.options, q.correctIndex, q.explanation]);
}

export async function setStatus(contestId, status, db = defaultDb) {
  await db.query('UPDATE contests SET status = $2 WHERE id = $1', [contestId, status]);
}

export async function softDelete(contestId, db = defaultDb) {
  await db.query(
    'UPDATE contests SET is_deleted = true, deleted_at = coalesce(deleted_at, now()) WHERE id = $1', [contestId]);
}

export async function hardDelete(contestId, db = defaultDb) {
  await db.query('DELETE FROM contests WHERE id = $1', [contestId]);
}

// Restoring can collide with a contest created in the freed week (23P01).
export async function restore(contestId, db = defaultDb) {
  await db.query('UPDATE contests SET is_deleted = false, deleted_at = NULL WHERE id = $1', [contestId]);
}
