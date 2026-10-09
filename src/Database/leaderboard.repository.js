// Leaderboards and ranks (schema §10): window functions over scored
// attempts of live students. Career boards group by the student's career
// at query time, never one stored on the attempt (spec §2.4).
import { db as defaultDb } from './db.js';

const CLOSED = `c.status = 'scheduled' AND NOT c.is_deleted AND c.closes_at <= now()`;

// One student's totals per board. Week: that contest ($4). Live: summed
// over every closed contest.
const WEEK = `
  SELECT a.student_id, a.score, a.correct, a.time_taken_s, 1 AS contests
    FROM attempts a WHERE a.contest_id = $4 AND a.score IS NOT NULL`;
const LIVE = `
  SELECT a.student_id, sum(a.score)::int AS score, sum(a.correct)::int AS correct,
         sum(a.time_taken_s)::int AS time_taken_s, count(*)::int AS contests
    FROM attempts a JOIN contests c ON c.id = a.contest_id
   WHERE ${CLOSED} AND a.score IS NOT NULL
   GROUP BY a.student_id`;

// The top `limit` rows plus the student's own row wherever it is.
// contestId null = Live; career null = global.
// → { total, rows, me } with me null when the student isn't on the board.
export async function board({ contestId, career, studentId, limit }, db = defaultDb) {
  const params = [studentId, career, limit];
  if (contestId != null) params.push(contestId);
  const { rows } = await db.query(
    `WITH src AS (${contestId != null ? WEEK : LIVE}),
     board AS (
       SELECT src.*, s.full_name, s.current_career,
              (RANK() OVER w)::int AS rank,
              ROW_NUMBER() OVER (ORDER BY src.score DESC, src.time_taken_s, s.full_name, s.id) AS pos,
              (COUNT(*) OVER ())::int AS total
         FROM src JOIN students s ON s.id = src.student_id AND NOT s.is_deleted
        WHERE ($2::text IS NULL OR s.current_career = $2)
       WINDOW w AS (ORDER BY src.score DESC, src.time_taken_s)
     )
     SELECT *, student_id = $1 AS is_me FROM board
      WHERE pos <= $3 OR student_id = $1 ORDER BY pos`,
    params);
  return {
    total: rows[0]?.total ?? 0,
    rows: rows.filter(r => Number(r.pos) <= limit),
    me: rows.find(r => r.is_me) || null,
  };
}

// The student's result and ranks in every closed contest they took (or
// just contestId). The career ranks are among students whose current
// career is `career`; ignore them when career is null.
export async function results({ studentId, career, contestId = null }, db = defaultDb) {
  const { rows } = await db.query(
    `WITH ranked AS (
       SELECT a.contest_id, a.student_id, a.score, a.correct, a.time_taken_s,
              (RANK() OVER (PARTITION BY a.contest_id ORDER BY a.score DESC, a.time_taken_s))::int AS global_rank,
              (COUNT(*) OVER (PARTITION BY a.contest_id))::int AS global_total,
              (RANK() OVER (PARTITION BY a.contest_id, s.current_career = $2
                            ORDER BY a.score DESC, a.time_taken_s))::int AS career_rank,
              (COUNT(*) OVER (PARTITION BY a.contest_id, s.current_career = $2))::int AS career_total
         FROM attempts a
         JOIN students s ON s.id = a.student_id AND NOT s.is_deleted
         JOIN contests c ON c.id = a.contest_id
        WHERE ${CLOSED} AND a.score IS NOT NULL AND ($3::int IS NULL OR a.contest_id = $3)
     )
     SELECT * FROM ranked WHERE student_id = $1`,
    [studentId, career, contestId]);
  return rows;
}
