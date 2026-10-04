// Request bodies for /auth/*. Each constructor validates and normalises the
// raw JSON body, throwing ApiError (400 with the bad field) when it's wrong.
import { ApiError } from './ApiError.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const PASSWORD_MIN = 8;
// scrypt's cost grows with input length; cap it so a huge body can't tie up the CPU.
export const PASSWORD_MAX = 200;

const str = v => (typeof v === 'string' ? v : '');

export class RegisterRequest {
  constructor(body = {}) {
    this.fullName = str(body.full_name).trim().replace(/\s+/g, ' ');
    if (!this.fullName) throw ApiError.invalid('Please enter your full name.', 'full_name');
    if (this.fullName.length > 80) throw ApiError.invalid('Full name must be at most 80 characters.', 'full_name');

    this.email = str(body.email).trim().toLowerCase();
    if (!EMAIL_RE.test(this.email) || this.email.length > 254) throw ApiError.invalid('Please enter a valid email.', 'email');

    this.password = str(body.password);
    if (this.password.length < PASSWORD_MIN) {
      throw ApiError.invalid(`Password must be at least ${PASSWORD_MIN} characters.`, 'password');
    }
    if (this.password.length > PASSWORD_MAX) {
      throw ApiError.invalid(`Password must be at most ${PASSWORD_MAX} characters.`, 'password');
    }

    // Optional. Blank means "my school isn't on CareerAI".
    this.schoolCode = str(body.school_code).trim().toUpperCase() || null;
  }
}

// Login doesn't validate format: any wrong input is just bad_credentials.
export class LoginRequest {
  constructor(body = {}) {
    this.email = str(body.email).trim().toLowerCase();
    this.password = str(body.password).slice(0, PASSWORD_MAX);
  }
}
