// Queries on attempts and attempt_answers, and the close job's scoring
// (schema §5.3, §5.4, §9).
import { db as defaultDb } from './db.js';

const SELECT = `
  SELECT a.id, a.contest_id, a.started_at, a.submitted_at, a.auto_submitted,
         a.correct, a.score, a.time_taken_s,
         (SELECT count(*)::int FROM attempt_answers aa WHERE aa.attempt_id = a.id) AS answered_count
    FROM attempts a`;

export async function find(contestId, studentId, db = defaultDb) {
  const { rows } = await db.query(`${SELECT} WHERE a.contest_id = $1 AND a.student_id = $2`, [contestId, studentId]);
  return rows[0] || null;
}

// Locks the attempt row for the rest of the transaction, so saving an
// answer and submitting can't interleave.
export async function lock(contestId, studentId, db = defaultDb) {
  const { rows } = await db.query(
    `SELECT id, started_at, submitted_at, time_taken_s FROM attempts
      WHERE contest_id = $1 AND student_id = $2 FOR UPDATE`,
    [contestId, studentId]);
  return rows[0] || null;
}

// Starts the clock, or does nothing when the attempt already exists: the
// clock is never reset. Read the row back with find().
export async function start(contestId, studentId, db = defaultDb) {
  await db.query(
    `INSERT INTO attempts (contest_id, student_id) VALUES ($1, $2)
     ON CONFLICT (contest_id, student_id) DO NOTHING`,
    [contestId, studentId]);
}

// { questionId: optionIndex }
export async function answers(attemptId, db = defaultDb) {
  const { rows } = await db.query(
    'SELECT question_id, option_index FROM attempt_answers WHERE attempt_id = $1', [attemptId]);
  return Object.fromEntries(rows.map(r => [r.question_id, r.option_index]));
}

// The latest choice wins. A question from another contest fails the
// composite FK (23503).
export async function saveAnswer({ attemptId, contestId, questionId, optionIndex }, db = defaultDb) {
  await db.query(
    `INSERT INTO attempt_answers (attempt_id, contest_id, question_id, option_index)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (attempt_id, question_id) DO UPDATE
       SET option_index = EXCLUDED.option_index, answered_at = now()`,
    [attemptId, contestId, questionId, optionIndex]);
}

// No score: that is only filled in by the close job.
export async function submit(attemptId, db = defaultDb) {
  const { rows } = await db.query(
    `UPDATE attempts SET submitted_at = now(),
            time_taken_s = GREATEST(1, round(extract(epoch FROM now() - started_at)))::int
      WHERE id = $1 RETURNING submitted_at, time_taken_s`,
    [attemptId]);
  return rows[0];
}

// ── Close job (schema §9) ─────────────────────────────────────────────────
// Auto-submits unfinished attempts at closes_at, then scores every attempt.
export async function scoreContest(contestId, db = defaultDb) {
  await db.query(
    `UPDATE attempts SET submitted_at = c.closes_at, auto_submitted = true
       FROM contests c
      WHERE attempts.contest_id = c.id AND c.id = $1 AND attempts.submitted_at IS NULL`,
    [contestId]);
  await db.query(
    `UPDATE attempts a SET
       correct      = s.correct,
       score        = s.correct * 10,
       time_taken_s = GREATEST(1, round(extract(epoch FROM a.submitted_at - a.started_at)))::int
       FROM (SELECT a2.id, count(q.id) FILTER (WHERE aa.option_index = q.correct_index)::smallint AS correct
               FROM attempts a2
               LEFT JOIN attempt_answers aa ON aa.attempt_id = a2.id
               LEFT JOIN contest_questions q ON q.contest_id = aa.contest_id AND q.id = aa.question_id
              WHERE a2.contest_id = $1
              GROUP BY a2.id) s
      WHERE a.id = s.id`,
    [contestId]);
}
