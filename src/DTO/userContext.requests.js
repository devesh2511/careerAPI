// Query for GET /userContext. The constructor validates and normalises it,
// throwing ApiError (400 with the bad field) when it's wrong.
import { ApiError } from './ApiError.js';
import { EMAIL_RE, str } from './auth.requests.js';

export class UserContextRequest {
  constructor(query = {}) {
    this.email = str(query.email).trim().toLowerCase();
    if (!EMAIL_RE.test(this.email) || this.email.length > 254) throw ApiError.invalid('Please give a valid email.', 'email');
  }
}
