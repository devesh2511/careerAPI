// Queries for My Career Space: careers' search terms and the career_news cache.
import { db as defaultDb } from './db.js';

// The career with its search terms, or null. Case-insensitive, like roadmaps.
export async function findCareer(title, db = defaultDb) {
  const { rows } = await db.query(
    'SELECT title, emoji, news_terms, exam_terms FROM careers WHERE lower(title) = lower($1)', [title]);
  return rows[0] || null;
}

// The last feed fetched for this career, or null.
export async function findFeed(career, db = defaultDb) {
  const { rows } = await db.query('SELECT * FROM career_news WHERE career = $1', [career]);
  return rows[0] || null;
}

// Stores a freshly fetched feed, replacing the old one. Returns the row.
export async function saveFeed(career, feed, sources, db = defaultDb) {
  const { rows } = await db.query(
    `INSERT INTO career_news (career, feed, sources, fetched_at) VALUES ($1, $2, $3, now())
     ON CONFLICT (career) DO UPDATE SET feed = EXCLUDED.feed, sources = EXCLUDED.sources, fetched_at = now()
     RETURNING *`,
    [career, JSON.stringify(feed), JSON.stringify(sources)]);
  return rows[0];
}
