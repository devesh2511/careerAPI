// Queries on career_quiz_results (schema §4.2).
import { db as defaultDb } from './db.js';

export async function insert(studentId, run, db = defaultDb) {
  const { rows } = await db.query(
    `INSERT INTO career_quiz_results
       (student_id, riasec_pct, riasec_code, confidence, top_career, results, answers, engine_version)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [studentId, JSON.stringify(run.riasecPct), run.riasecCode, run.confidence, run.topCareer,
      JSON.stringify(run.results), run.answers === null ? null : JSON.stringify(run.answers), run.engineVersion]);
  return rows[0];
}

// Deletes all but the student's newest `keep` runs.
export async function deleteAllButNewest(studentId, keep, db = defaultDb) {
  await db.query(
    `DELETE FROM career_quiz_results
      WHERE student_id = $1
        AND id NOT IN (SELECT id FROM career_quiz_results WHERE student_id = $1
                        ORDER BY created_at DESC, id DESC LIMIT $2)`,
    [studentId, keep]);
}

// The student's newest run, or null when they haven't taken the quiz.
export async function findLatest(studentId, db = defaultDb) {
  const { rows } = await db.query(
    `SELECT * FROM career_quiz_results WHERE student_id = $1
      ORDER BY created_at DESC, id DESC LIMIT 1`,
    [studentId]);
  return rows[0] || null;
}
