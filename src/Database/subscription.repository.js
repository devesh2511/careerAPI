// Queries on subscription and payments. A subscription is created when an
// institute's list is uploaded; its payment is recorded afterwards. Neither
// is edited or deleted by the admin panel: renewals are new rows, and
// payment records outlive the payer.
import { db as defaultDb } from './db.js';

// An institute's subscriptions, newest first, each with how many list rows
// are on it, whether it covers now, and its payment (null until recorded).
export async function listForInstitute(instituteId, db = defaultDb) {
  const { rows } = await db.query(
    `SELECT s.*, now() >= s.starts_at AND now() < s.ends_at AS current,
            (SELECT count(*)::int FROM "user" u WHERE u.subscription_id = s.id) AS students,
            (SELECT row_to_json(p) FROM payments p WHERE p.id = s.payment_id) AS payment
       FROM subscription s
      WHERE s.institute_id = $1
      ORDER BY s.starts_at DESC, s.id DESC`,
    [instituteId]);
  return rows;
}

export async function insert({ instituteId, headCount, startsAt, endsAt, adminId }, db = defaultDb) {
  const { rows } = await db.query(
    `INSERT INTO subscription (institute_id, head_count, starts_at, ends_at, created_by)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [instituteId, headCount, startsAt, endsAt, adminId]);
  return rows[0];
}

// The subscription, locked, when it belongs to this institute. null otherwise.
export async function findForUpdate(instituteId, subscriptionId, db = defaultDb) {
  const { rows } = await db.query(
    'SELECT * FROM subscription WHERE id = $1 AND institute_id = $2 FOR UPDATE', [subscriptionId, instituteId]);
  return rows[0] || null;
}

// A reused transaction ID surfaces as 23505 on payments_transaction_id_key.
export async function insertPayment(instituteId, p, adminId, db = defaultDb) {
  const { rows } = await db.query(
    `INSERT INTO payments (transaction_id, institute_id, mode_of_payment, amount, date_of_payment, recorded_by)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [p.transactionId, instituteId, p.modeOfPayment, p.amount, p.dateOfPayment, adminId]);
  return rows[0];
}

export async function attachPayment(subscriptionId, paymentId, db = defaultDb) {
  await db.query('UPDATE subscription SET payment_id = $2 WHERE id = $1', [subscriptionId, paymentId]);
}

// Every payment from this institute, newest first.
export async function listPayments(instituteId, db = defaultDb) {
  const { rows } = await db.query(
    `SELECT p.*, s.id AS subscription_id
       FROM payments p LEFT JOIN subscription s ON s.payment_id = p.id
      WHERE p.institute_id = $1
      ORDER BY p.date_of_payment DESC, p.id DESC`,
    [instituteId]);
  return rows;
}
