// Request bodies for /auth/*. Each constructor validates and normalises the
// raw JSON body, throwing ApiError (400 with the bad field) when it's wrong.
import { ApiError } from './ApiError.js';

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const PASSWORD_MIN = 8;
// scrypt's cost grows with input length; cap it so a huge body can't tie up the CPU.
export const PASSWORD_MAX = 200;
export const BOARDS = ['CBSE', 'ICSE', 'State Board'];
export const CLASSES = [9, 10];
export const USERNAME_RE = /^[a-z0-9._]{3,30}$/;
export const NAME_MAX = 80;

export const str = v => (typeof v === 'string' ? v : '');

// ── Shared normalisers (also used by the admin list upload) ───────────────
// Trimmed and single-spaced. Matching against the institute list ignores case.
export const normName = v => str(v).trim().replace(/\s+/g, ' ');

// A 10-digit Indian mobile number, or null. Accepts +91 / 91 / 0 in front and
// spaces, dashes, dots or brackets anywhere.
export function normPhone(v) {
  let d = (typeof v === 'number' ? String(Math.trunc(v)) : str(v)).replace(/[\s\-().+]/g, '');
  if (!/^\d+$/.test(d)) return null;
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? d : null;
}

export const normCode = v => str(v).trim().toUpperCase();

function password(body, key = 'password') {
  const p = str(body[key]);
  if (p.length < PASSWORD_MIN) throw ApiError.invalid(`Password must be at least ${PASSWORD_MIN} characters.`, key);
  if (p.length > PASSWORD_MAX) throw ApiError.invalid(`Password must be at most ${PASSWORD_MAX} characters.`, key);
  return p;
}

// Optional email: blank → null.
export function optionalEmail(body, key = 'email') {
  const e = str(body[key]).trim().toLowerCase();
  if (!e) return null;
  if (!EMAIL_RE.test(e) || e.length > 254) throw ApiError.invalid('Please enter a valid email, or leave it blank.', key);
  return e;
}

// class, board and city: asked at registration, editable later.
export function accountDetails(body, { partial = false } = {}) {
  const out = {};
  const has = key => Object.prototype.hasOwnProperty.call(body, key);
  if (!partial || has('class')) {
    const c = typeof body.class === 'string' ? Number(body.class) : body.class;
    if (!CLASSES.includes(c)) throw ApiError.invalid('Pick your class.', 'class');
    out.class = c;
  }
  if (!partial || has('board')) {
    if (!BOARDS.includes(body.board)) throw ApiError.invalid('Pick your board.', 'board');
    out.board = body.board;
  }
  if (!partial || has('city')) {
    const city = normName(body.city);
    if (!city) throw ApiError.invalid('Please enter your city.', 'city');
    if (city.length > NAME_MAX) throw ApiError.invalid(`City must be at most ${NAME_MAX} characters.`, 'city');
    out.city = city;
  }
  return out;
}

// ── Registration ──────────────────────────────────────────────────────────
// Name, phone and institute ID: what places a student on an institute's list.
export class ListEntryRequest {
  constructor(body = {}) {
    this.name = normName(body.full_name);
    if (!this.name) throw ApiError.invalid('Please enter your full name.', 'full_name');
    if (this.name.length > NAME_MAX) throw ApiError.invalid(`Full name must be at most ${NAME_MAX} characters.`, 'full_name');

    this.phoneNo = normPhone(body.phone_no);
    if (!this.phoneNo) throw ApiError.invalid('Please enter a 10-digit mobile number.', 'phone_no');

    this.instituteCode = normCode(body.institute_code);
    if (!this.instituteCode) throw ApiError.invalid('Please enter your institute ID.', 'institute_code');
    if (this.instituteCode.length > 20) throw ApiError.invalid('Institute ID must be at most 20 characters.', 'institute_code');
  }
}

// POST /auth/register: a first account.
export class RegisterRequest extends ListEntryRequest {
  constructor(body = {}) {
    super(body);
    this.username = str(body.username).trim().toLowerCase();
    if (!USERNAME_RE.test(this.username)) {
      throw ApiError.invalid('Username must be 3–30 letters, digits, dots or underscores.', 'username');
    }
    this.password = password(body);
    this.email = optionalEmail(body);
    this.details = accountDetails(body);
  }
}

// POST /auth/register/link: an institute added to an existing account.
export class LinkRequest extends ListEntryRequest {
  constructor(body = {}) {
    super(body);
    this.password = str(body.password).slice(0, PASSWORD_MAX);
    if (!this.password) throw ApiError.invalid('Enter the password of your existing account.', 'password');
  }
}

// Login doesn't validate format: any wrong input is just bad_credentials.
export class LoginRequest {
  constructor(body = {}) {
    this.username = str(body.username).trim().toLowerCase().slice(0, 254);
    this.password = str(body.password).slice(0, PASSWORD_MAX);
  }
}

// ── Password reset ────────────────────────────────────────────────────────
// POST /auth/forgot-password { username }. The link only goes to a
// confirmed email.
export class ForgotPasswordRequest {
  constructor(body = {}) {
    this.username = str(body.username).trim().toLowerCase().slice(0, 254);
    if (!this.username) throw ApiError.invalid('Please enter your username.', 'username');
  }
}

// POST /auth/confirm-email { token }, from the emailed link.
export class ConfirmEmailRequest {
  constructor(body = {}) {
    this.token = str(body.token).trim();
    if (!/^[A-Za-z0-9_-]{20,100}$/.test(this.token)) {
      throw new ApiError(400, 'invalid_link', 'This link is wrong or has expired. Ask for a new one.', 'token');
    }
  }
}

// POST /auth/reset-password { token, new_password } — token from the emailed link.
export class ResetPasswordRequest {
  constructor(body = {}) {
    this.token = str(body.token).trim();
    if (!/^[A-Za-z0-9_-]{20,100}$/.test(this.token)) {
      throw new ApiError(400, 'invalid_link', 'This link is wrong or has expired. Ask for a new one.', 'token');
    }
    this.newPassword = password(body, 'new_password');
  }
}
