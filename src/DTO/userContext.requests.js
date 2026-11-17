// Query for GET /userContext. The constructor validates and normalises it,
// throwing ApiError (400 with the bad field) when it's wrong.
import { ApiError } from './ApiError.js';
import { USERNAME_RE, str } from './auth.requests.js';

// ?username= — the student's login name (from their own GET /me). Email
// isn't used: it's optional and two students (siblings) may share one.
export class UserContextRequest {
  constructor(query = {}) {
    this.username = str(query.username).trim().toLowerCase();
    if (!USERNAME_RE.test(this.username)) throw ApiError.invalid('Please give a valid username.', 'username');
  }
}
