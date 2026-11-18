// Queries on student_events: the history of an account (admin actions, school
// moves). See 018_admin_support.sql.
import { db as defaultDb } from './db.js';

export async function insertEvent({ studentId, adminId = null, kind, note = null, data = {} }, db = defaultDb) {
  await db.query(
    'INSERT INTO student_events (student_id, admin_id, kind, note, data) VALUES ($1, $2, $3, $4, $5)',
    [studentId, adminId, kind, note, JSON.stringify(data)]);
}

// Newest first, each with the admin's name (null for automatic events).
export async function listForStudent(studentId, db = defaultDb) {
  const { rows } = await db.query(
    `SELECT e.id, e.kind, e.note, e.data, e.created_at, a.id AS admin_id, a.full_name AS admin_name
       FROM student_events e LEFT JOIN admins a ON a.id = e.admin_id
      WHERE e.student_id = $1
      ORDER BY e.created_at DESC, e.id DESC`,
    [studentId]);
  return rows;
}

// Old names / phones (student_aliases), newest first.
export async function aliasesFor(studentId, db = defaultDb) {
  const { rows } = await db.query(
    'SELECT name, phone_no, created_at FROM student_aliases WHERE student_id = $1 ORDER BY created_at DESC, id DESC',
    [studentId]);
  return rows;
}

export async function insertAlias({ studentId, name, phoneNo, adminId }, db = defaultDb) {
  await db.query(
    `INSERT INTO student_aliases (student_id, name, phone_no, created_by) VALUES ($1, $2, $3, $4)
     ON CONFLICT (student_id, phone_no, lower(name)) DO NOTHING`,
    [studentId, name, phoneNo, adminId]);
}

// The account's current details are no longer "old" ones.
export async function removeAlias({ studentId, name, phoneNo }, db = defaultDb) {
  await db.query(
    'DELETE FROM student_aliases WHERE student_id = $1 AND phone_no = $2 AND lower(name) = lower($3)',
    [studentId, phoneNo, name]);
}
