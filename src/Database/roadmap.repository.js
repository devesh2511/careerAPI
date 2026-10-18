// Queries on career_roadmaps.
import { db as defaultDb } from './db.js';

// Every career that has a roadmap, in catalogue order (no steps).
export async function listCareers(db = defaultDb) {
  const { rows } = await db.query(
    `SELECT r.career, r.emoji FROM career_roadmaps r JOIN careers c ON c.title = r.career
      ORDER BY c.sort_order, c.title`);
  return rows;
}

// The roadmap for this career, or null. Case-insensitive, so "ui/ux designer" finds it.
export async function findByCareer(career, db = defaultDb) {
  const { rows } = await db.query(
    'SELECT * FROM career_roadmaps WHERE lower(career) = lower($1)', [career]);
  return rows[0] || null;
}

// ── Admin ───────────────────────────────────────────────────────────────

// Every career in the catalogue, with its roadmap's state (NULLs when it has none).
export async function listForAdmin(db = defaultDb) {
  const { rows } = await db.query(
    `SELECT c.title, c.emoji, c.field, c.stream, c.family,
            jsonb_array_length(r.steps) AS step_count, r.version, r.updated_at,
            a.full_name AS updated_by
       FROM careers c
       LEFT JOIN career_roadmaps r ON r.career = c.title
       LEFT JOIN admins a ON a.id = r.updated_by
      ORDER BY c.sort_order, c.title`);
  return rows;
}

// The roadmap with the name of the admin who saved it last, or null.
export async function findForAdmin(career, db = defaultDb) {
  const { rows } = await db.query(
    `SELECT r.*, a.full_name AS updated_by_name
       FROM career_roadmaps r LEFT JOIN admins a ON a.id = r.updated_by
      WHERE r.career = $1`, [career]);
  return rows[0] || null;
}

// A first roadmap for this career. null when one already exists.
export async function insert(career, emoji, steps, adminId, db = defaultDb) {
  const { rows } = await db.query(
    `INSERT INTO career_roadmaps (career, emoji, steps, updated_by) VALUES ($1, $2, $3, $4)
     ON CONFLICT (career) DO NOTHING RETURNING career`,
    [career, emoji, JSON.stringify(steps), adminId]);
  return rows[0] || null;
}

// Replaces the roadmap only if it is still at `version`. null when it moved
// on (another admin saved) or was deleted.
export async function update(career, emoji, steps, adminId, version, db = defaultDb) {
  const { rows } = await db.query(
    `UPDATE career_roadmaps
        SET emoji = $2, steps = $3, updated_by = $4, version = version + 1, updated_at = now()
      WHERE career = $1 AND version = $5 RETURNING career`,
    [career, emoji, JSON.stringify(steps), adminId, version]);
  return rows[0] || null;
}

// true when there was a roadmap to delete.
export async function remove(career, db = defaultDb) {
  const { rowCount } = await db.query('DELETE FROM career_roadmaps WHERE career = $1', [career]);
  return rowCount > 0;
}
