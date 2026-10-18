// Queries on career_roadmaps.
import { db as defaultDb } from './db.js';

// Every career that has a roadmap, in picker order (no steps).
export async function listCareers(db = defaultDb) {
  const { rows } = await db.query(
    'SELECT career, emoji FROM career_roadmaps ORDER BY sort_order, career');
  return rows;
}

// The roadmap for this career, or null. Case-insensitive, so "ui/ux designer" finds it.
export async function findByCareer(career, db = defaultDb) {
  const { rows } = await db.query(
    'SELECT * FROM career_roadmaps WHERE lower(career) = lower($1)', [career]);
  return rows[0] || null;
}
