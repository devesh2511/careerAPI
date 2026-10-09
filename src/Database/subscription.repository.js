// Queries on subscriptions. Rows are never edited or deleted by the admin
// panel: renewals are new rows, and payment records outlive the payer.
import { db as defaultDb } from './db.js';

// A payer's payments, newest first, each marked current when active and covering now.
const LIST = `
  SELECT *, status = 'active' AND now() >= starts_at AND now() < ends_at AS current
    FROM subscriptions`;

export async function listForSchool(schoolId, db = defaultDb) {
  const { rows } = await db.query(`${LIST} WHERE school_id = $1 ORDER BY starts_at DESC, id DESC`, [schoolId]);
  return rows;
}

export async function listForStudent(studentId, db = defaultDb) {
  const { rows } = await db.query(`${LIST} WHERE student_id = $1 ORDER BY starts_at DESC, id DESC`, [studentId]);
  return rows;
}

// An active school_annual plan. A reused reference surfaces as 23505 on
// subscriptions_payment_provider_payment_ref_key.
export async function insertSchoolPlan(schoolId, p, db = defaultDb) {
  const { rows } = await db.query(
    `INSERT INTO subscriptions (payer_type, school_id, plan, starts_at, ends_at, amount_paise,
                                status, payment_provider, payment_ref)
     VALUES ('school', $1, 'school_annual', $2, $3, $4, 'active', $5, $6) RETURNING *`,
    [schoolId, p.startsAt, p.endsAt, p.amountPaise, p.paymentProvider, p.paymentRef]);
  return rows[0];
}

// An active individual plan, paid outside the website. Same 23505 on a reused reference.
export async function insertStudentPlan(studentId, p, db = defaultDb) {
  const { rows } = await db.query(
    `INSERT INTO subscriptions (payer_type, student_id, plan, starts_at, ends_at, amount_paise,
                                status, payment_provider, payment_ref)
     VALUES ('student', $1, $2, $3, $4, $5, 'active', $6, $7) RETURNING *`,
    [studentId, p.plan, p.startsAt, p.endsAt, p.amountPaise, p.paymentProvider, p.paymentRef]);
  return rows[0];
}
