// Request bodies and parameters for /admin/*. Each constructor validates and
// normalises the raw input, throwing ApiError (400 with the bad field) when
// it's wrong. Admin login reuses LoginRequest from auth.requests.js.
import { ApiError } from './ApiError.js';
import { EMAIL_RE, PASSWORD_MIN, PASSWORD_MAX, str } from './auth.requests.js';

export const AREAS = ['Logical Reasoning', 'Numerical Ability', 'Verbal Ability', 'Spatial Reasoning'];
const BOARDS = ['CBSE', 'ICSE', 'State Board'];
const INT_MAX = 2147483647;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ── Path and query parameters ─────────────────────────────────────────────
// A malformed id can't match any row, so it is a 404 like a missing one.
export function intId(value, what) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > INT_MAX) throw ApiError.notFound(what);
  return n;
}

export function uuidId(value, what) {
  if (!UUID_RE.test(String(value))) throw ApiError.notFound(what);
  return String(value).toLowerCase();
}

// ?deleted=true lists only soft-deleted rows.
export const listDeleted = query => query.deleted === 'true' || query.deleted === '1';

// ?mode=soft|hard, soft by default (schema §7).
export function deleteMode(query) {
  const mode = query.mode ?? 'soft';
  if (mode !== 'soft' && mode !== 'hard') throw new ApiError(400, 'bad_mode', 'Delete mode must be soft or hard.');
  return mode;
}

// ?q= search text, as an ILIKE pattern ('' when absent).
export function searchPattern(query) {
  const q = str(query.q).trim().slice(0, 100);
  return q ? `%${q.replace(/[\\%_]/g, c => '\\' + c)}%` : '';
}

// ── Bodies ────────────────────────────────────────────────────────────────
export class CreateAdminRequest {
  constructor(body = {}) {
    this.fullName = str(body.full_name).trim().replace(/\s+/g, ' ');
    if (!this.fullName) throw ApiError.invalid('Enter a name.', 'full_name');
    if (this.fullName.length > 80) throw ApiError.invalid('Name must be at most 80 characters.', 'full_name');

    this.email = str(body.email).trim().toLowerCase();
    if (!EMAIL_RE.test(this.email) || this.email.length > 254) throw ApiError.invalid('Enter a valid email.', 'email');

    this.password = str(body.password);
    if (this.password.length < PASSWORD_MIN) {
      throw ApiError.invalid(`Password must be at least ${PASSWORD_MIN} characters.`, 'password');
    }
    if (this.password.length > PASSWORD_MAX) {
      throw ApiError.invalid(`Password must be at most ${PASSWORD_MAX} characters.`, 'password');
    }
  }
}

// POST /admin/students/:id/password  { password }
export class SetStudentPasswordRequest {
  constructor(body = {}) {
    this.password = str(body.password);
    if (this.password.length < PASSWORD_MIN) {
      throw ApiError.invalid(`Password must be at least ${PASSWORD_MIN} characters.`, 'password');
    }
    if (this.password.length > PASSWORD_MAX) {
      throw ApiError.invalid(`Password must be at most ${PASSWORD_MAX} characters.`, 'password');
    }
  }
}

// POST /admin/contests  { date: 'YYYY-MM-DD' }, a Saturday in the future.
export class CreateContestRequest {
  constructor(body = {}) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str(body.date));
    if (!m) throw ApiError.invalid('Pick a Saturday.', 'date');
    // 07:00 IST on that date = 01:30 UTC the same day.
    const opens = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 1, 30));
    if (opens.getUTCDate() !== +m[3]) throw ApiError.invalid('Pick a Saturday.', 'date');
    if (opens.getUTCDay() !== 6) throw ApiError.invalid('Contests open on a Saturday.', 'date');
    if (opens.getTime() <= Date.now()) throw ApiError.invalid('Pick a Saturday in the future.', 'date');
    this.opensAt = opens;
  }
}

// PUT /admin/contests/:id/questions/:position
export class QuestionRequest {
  constructor(position, body = {}) {
    this.position = Number(position);
    if (!Number.isInteger(this.position) || this.position < 1 || this.position > 5) {
      throw ApiError.invalid('Position must be 1–5.', 'position');
    }

    this.area = str(body.area);
    if (!AREAS.includes(this.area)) throw ApiError.invalid('Pick an area.', 'area');

    this.text = str(body.text).trim();
    if (!this.text) throw ApiError.invalid('Write the question.', 'text');
    if (this.text.length > 2000) throw ApiError.invalid('The question must be at most 2000 characters.', 'text');

    const options = Array.isArray(body.options) ? body.options.map(o => str(o).trim()) : [];
    if (options.length !== 4 || options.some(o => !o)) throw ApiError.invalid('Fill in all 4 options.', 'options');
    if (options.some(o => o.length > 500)) throw ApiError.invalid('Each option must be at most 500 characters.', 'options');
    if (new Set(options.map(o => o.toLowerCase())).size !== 4) {
      throw ApiError.invalid('The 4 options must be different.', 'options');
    }
    this.options = options;

    // null and '' must not coerce to 0 (option A).
    const ci = body.correct_index;
    this.correctIndex = typeof ci === 'number' || (typeof ci === 'string' && ci.trim() !== '') ? Number(ci) : NaN;
    if (!Number.isInteger(this.correctIndex) || this.correctIndex < 0 || this.correctIndex > 3) {
      throw ApiError.invalid('Mark the correct option.', 'correct_index');
    }

    this.explanation = str(body.explanation).trim();
    if (!this.explanation) throw ApiError.invalid('Write the explanation students see after close.', 'explanation');
    if (this.explanation.length > 4000) {
      throw ApiError.invalid('The explanation must be at most 4000 characters.', 'explanation');
    }
  }
}

// POST and PUT /admin/schools (SchoolInput).
export class SchoolRequest {
  constructor(body = {}) {
    const required = (key, label, max = 200) => {
      const v = str(body[key]).trim();
      if (!v) throw ApiError.invalid(`${label} is required.`, key);
      if (v.length > max) throw ApiError.invalid(`${label} must be at most ${max} characters.`, key);
      return v;
    };
    this.name = required('name', 'School name');
    this.school_code = required('school_code', 'School ID').toUpperCase();
    if (!/^[A-Z0-9-]{3,20}$/.test(this.school_code)) {
      throw ApiError.invalid('School ID must be 3–20 letters, digits or dashes.', 'school_code');
    }
    const udise = str(body.udise_code).trim();
    if (udise && !/^[0-9]{11}$/.test(udise)) throw ApiError.invalid('UDISE+ code must be 11 digits.', 'udise_code');
    this.udise_code = udise || null;
    this.board = BOARDS.includes(body.board) ? body.board : null;
    this.city = required('city', 'City', 100);
    this.state = required('state', 'State', 100);
    this.status = body.status === 'suspended' ? 'suspended' : 'active';
    this.contact_name = required('contact_name', 'Contact name', 100);
    this.contact_email = required('contact_email', 'Contact email', 254).toLowerCase();
    if (!EMAIL_RE.test(this.contact_email)) throw ApiError.invalid('Contact email looks wrong.', 'contact_email');
    this.contact_phone = str(body.contact_phone).trim().slice(0, 40) || null;
  }
}

// POST /admin/schools/:id/subscriptions — a payment the school made.
export class SchoolSubscriptionRequest {
  constructor(body = {}) {
    const date = key => {
      const t = typeof body[key] === 'string' ? Date.parse(body[key]) : NaN;
      return Number.isNaN(t) ? null : new Date(t);
    };
    this.startsAt = date('starts_at');
    if (!this.startsAt) throw ApiError.invalid('Pick a start date.', 'starts_at');
    this.endsAt = date('ends_at');
    if (!this.endsAt || this.endsAt <= this.startsAt) {
      throw ApiError.invalid('The end date must be after the start date.', 'ends_at');
    }

    this.amountPaise = body.amount_paise;
    if (!Number.isInteger(this.amountPaise) || this.amountPaise < 0 || this.amountPaise > INT_MAX) {
      throw ApiError.invalid('Enter the amount paid.', 'amount_paise');
    }

    this.paymentProvider = body.payment_provider ?? 'invoice';
    if (this.paymentProvider !== 'invoice' && this.paymentProvider !== 'razorpay') {
      throw ApiError.invalid('Payment provider must be invoice or razorpay.', 'payment_provider');
    }
    this.paymentRef = str(body.payment_ref).trim();
    if (!this.paymentRef) throw ApiError.invalid('Enter the invoice or payment reference.', 'payment_ref');
    if (this.paymentRef.length > 100) {
      throw ApiError.invalid('The reference must be at most 100 characters.', 'payment_ref');
    }
  }
}

// POST /admin/schools/:id/roster — CSV text. One email per line; commas and
// semicolons also separate, quotes are stripped, an `email` header is skipped.
export function parseRoster(text) {
  const emails = [], invalid = [], seen = new Set();
  for (const raw of String(text || '').split(/[\r\n,;]+/)) {
    const value = raw.trim().replace(/^"|"$/g, '').trim();
    const email = value.toLowerCase();
    if (!email || seen.has(email)) continue;
    seen.add(email);
    if (email === 'email' || email === 'emails') continue;
    if (!EMAIL_RE.test(email) || email.length > 254) invalid.push(value);
    else emails.push(email);
  }
  return { emails, invalid };
}
