// Queries on schools.
import { db as defaultDb } from './db.js';

// A school students can join: active and not deleted. Codes are stored upper-case.
export async function findJoinableByCode(schoolCode, db = defaultDb) {
  const { rows } = await db.query(
    `SELECT id, name, school_code FROM schools
      WHERE school_code = $1 AND status = 'active' AND NOT is_deleted`,
    [schoolCode]);
  return rows[0] || null;
}

// Name and School ID shown on a student's account. null once deleted.
export async function findRefById(schoolId, db = defaultDb) {
  const { rows } = await db.query(
    'SELECT name, school_code FROM schools WHERE id = $1 AND NOT is_deleted', [schoolId]);
  return rows[0] || null;
}
