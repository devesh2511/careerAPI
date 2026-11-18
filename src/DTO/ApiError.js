// The one error type the API throws. The error handler in server.js turns
// it into { error: { code, message, field?, reason?, details? } } (docs/openapi.yaml → Error).
const PAYWALL_MESSAGES = {
  not_subscribed: "Your account is INACTIVE your school hasn't subscribed yet",
  pending_approval: 'Your account is waiting for approval from your institute',
};

export class ApiError extends Error {
  constructor(status, code, message, field) {
    super(message);
    this.status = status;
    this.code = code;
    this.field = field;
  }

  static invalid(message, field) { return new ApiError(400, 'invalid', message, field); }
  static unauthenticated() { return new ApiError(401, 'unauthenticated', 'Please log in.'); }
  static notFound(what) { return new ApiError(404, 'not_found', `No such ${what}.`); }

  // 402 with the paywall's reason (not_subscribed | pending_approval).
  static paymentRequired(reason) {
    const err = new ApiError(402, 'payment_required', PAYWALL_MESSAGES[reason] || 'You need a plan to use this.');
    err.reason = reason;
    return err;
  }

  toJSON() {
    const error = { code: this.code, message: this.message };
    if (this.field) error.field = this.field;
    if (this.reason) error.reason = this.reason;
    if (this.details) error.details = this.details;
    return { error };
  }
}
