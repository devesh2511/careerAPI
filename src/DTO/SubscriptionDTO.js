// The Subscription object in docs/openapi.yaml. `current` is only set on the
// admin's lists of a school's or a student's payments.
import { ApiError } from './ApiError.js';

export class SubscriptionDTO {
  constructor(row) {
    this.id = Number(row.id);   // bigint comes back from pg as a string
    this.payer_type = row.payer_type;
    this.school_id = row.school_id;
    this.student_id = row.student_id;
    this.plan = row.plan;
    this.starts_at = row.starts_at;
    this.ends_at = row.ends_at;
    this.amount_paise = row.amount_paise;
    this.currency = row.currency;
    this.status = row.status;
    this.payment_provider = row.payment_provider;
    this.payment_ref = row.payment_ref;
    this.created_at = row.created_at;
    if (row.current !== undefined) this.current = row.current;
  }
}

// Runs an insert, turning a reused (payment_provider, payment_ref) into 409.
export async function guardDuplicatePayment(fn) {
  try {
    return await fn();
  } catch (err) {
    if (err.code === '23505' && err.constraint === 'subscriptions_payment_provider_payment_ref_key') {
      throw new ApiError(409, 'duplicate_payment', 'This payment reference is already recorded.', 'payment_ref');
    }
    throw err;
  }
}
