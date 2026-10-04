// The one error type the API throws. The error handler in server.js turns
// it into { error: { code, message, field? } } (docs/openapi.yaml → Error).
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

  toJSON() {
    const error = { code: this.code, message: this.message };
    if (this.field) error.field = this.field;
    return { error };
  }
}
