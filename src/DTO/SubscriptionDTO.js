// The Subscription and Payment objects in docs/openapi.yaml.
import { ApiError } from './ApiError.js';

export class PaymentDTO {
  // row: a payments row (or its row_to_json form).
  constructor(row) {
    this.id = row.id;
    this.transaction_id = row.transaction_id;
    this.institute_id = row.institute_id;
    this.mode_of_payment = row.mode_of_payment;
    // numeric comes back from pg as a string.
    this.amount = Number(row.amount);
    // date columns: plain 'YYYY-MM-DD' (row_to_json) or a Date at local midnight (pg).
    this.date_of_payment = row.date_of_payment instanceof Date
      ? toYmd(row.date_of_payment) : String(row.date_of_payment).slice(0, 10);
    this.created_at = row.created_at instanceof Date ? row.created_at : new Date(row.created_at);
    if (row.subscription_id !== undefined) this.subscription_id = row.subscription_id;
  }
}

const toYmd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export class SubscriptionDTO {
  constructor(row) {
    this.id = row.id;
    this.institute_id = row.institute_id;
    this.head_count = row.head_count;
    this.starts_at = row.starts_at;
    this.ends_at = row.ends_at;
    this.payment = row.payment ? new PaymentDTO(row.payment) : null;
    this.created_at = row.created_at;
    if (row.current !== undefined) this.current = row.current;
    if (row.students !== undefined) this.students = row.students;
  }
}

// Runs an insert, turning a reused transaction ID into 409.
export async function guardDuplicatePayment(fn) {
  try {
    return await fn();
  } catch (err) {
    if (err.code === '23505' && err.constraint === 'payments_transaction_id_key') {
      throw new ApiError(409, 'duplicate_payment', 'This transaction ID is already recorded.', 'transaction_id');
    }
    throw err;
  }
}
