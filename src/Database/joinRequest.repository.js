// Queries on join_requests: students who aren't on an institute's list asking
// to join it (institutes with accepts_requests only). See 017_join_requests.sql.
import { db as defaultDb } from './db.js';

// false when this account already has a request in for this institute.
export async function insert(instituteId, studentId, db = defaultDb) {
  const { rowCount } = await db.query(
    `INSERT INTO join_requests (institute_id, metadata_id) VALUES ($1, $2)
     ON CONFLICT (institute_id, metadata_id) DO NOTHING`,
    [instituteId, studentId]);
  return rowCount > 0;
}

export async function exists(instituteId, studentId, db = defaultDb) {
  const { rows } = await db.query(
    'SELECT 1 FROM join_requests WHERE institute_id = $1 AND metadata_id = $2', [instituteId, studentId]);
  return rows.length > 0;
}

// Oldest first, each with the account asking.
export async function listForInstitute(instituteId, db = defaultDb) {
  const { rows } = await db.query(
    `SELECT r.id, r.created_at, m.id AS student_id, m.username, m.name, m.phone_no, m.email,
            m.class, m.board, m.city, m.is_deleted
       FROM join_requests r JOIN user_metadata m ON m.id = r.metadata_id
      WHERE r.institute_id = $1
      ORDER BY r.created_at, r.id`,
    [instituteId]);
  return rows;
}

// One request with its account's name and phone, locked. null when it isn't
// this institute's (or was already handled).
export async function findForUpdate(instituteId, requestId, db = defaultDb) {
  const { rows } = await db.query(
    `SELECT r.id, r.metadata_id, m.name, m.phone_no, m.username
       FROM join_requests r JOIN user_metadata m ON m.id = r.metadata_id
      WHERE r.id = $1 AND r.institute_id = $2
      FOR UPDATE OF r`,
    [requestId, instituteId]);
  return rows[0] || null;
}

export async function remove(requestId, db = defaultDb) {
  const { rowCount } = await db.query('DELETE FROM join_requests WHERE id = $1', [requestId]);
  return rowCount > 0;
}

// Once a student is on the list anyway (linked through it), their request
// for that institute has nothing left to decide.
export async function removeFor(instituteId, studentId, db = defaultDb) {
  await db.query('DELETE FROM join_requests WHERE institute_id = $1 AND metadata_id = $2', [instituteId, studentId]);
}
