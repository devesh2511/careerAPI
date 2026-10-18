// Queries on careers.
import { db as defaultDb } from './db.js';

// The whole catalogue, in catalogue order.
export async function findAll(db = defaultDb) {
  const { rows } = await db.query('SELECT * FROM careers ORDER BY sort_order, title');
  return rows;
}

// One career by its exact title, or null.
export async function findByTitle(title, db = defaultDb) {
  const { rows } = await db.query('SELECT * FROM careers WHERE title = $1', [title]);
  return rows[0] || null;
}
