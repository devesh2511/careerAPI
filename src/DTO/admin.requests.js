// Request bodies and parameters for /admin/*. Each constructor validates and
// normalises the raw input, throwing ApiError (400 with the bad field) when
// it's wrong.
import { ApiError } from './ApiError.js';
import { EMAIL_RE, PASSWORD_MIN, PASSWORD_MAX, str, normName, normPhone } from './auth.requests.js';

export const AREAS = ['Logical Reasoning', 'Numerical Ability', 'Verbal Ability', 'Spatial Reasoning'];
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

// ── Admin login and password reset (by email, with a 6-digit code) ────────
// Login doesn't validate format: any wrong input is just bad_credentials.
export class AdminLoginRequest {
  constructor(body = {}) {
    this.email = str(body.email).trim().toLowerCase();
    this.password = str(body.password).slice(0, PASSWORD_MAX);
  }
}

// Doesn't reveal whether the email exists, so a malformed email is simply
// not found rather than an error.
export class AdminForgotPasswordRequest {
  constructor(body = {}) {
    this.email = str(body.email).trim().toLowerCase().slice(0, 254);
  }
}

export class AdminResetPasswordRequest {
  constructor(body = {}) {
    this.email = str(body.email).trim().toLowerCase().slice(0, 254);
    if (!this.email) throw ApiError.invalid('Please enter your email.', 'email');

    this.code = str(body.code).replace(/\s+/g, '');
    if (!/^\d{6}$/.test(this.code)) throw ApiError.invalid('The code is 6 digits.', 'code');

    this.newPassword = str(body.new_password);
    if (this.newPassword.length < PASSWORD_MIN) {
      throw ApiError.invalid(`Password must be at least ${PASSWORD_MIN} characters.`, 'new_password');
    }
    if (this.newPassword.length > PASSWORD_MAX) {
      throw ApiError.invalid(`Password must be at most ${PASSWORD_MAX} characters.`, 'new_password');
    }
  }
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

// The note an admin leaves on a support action (why, who asked). Required.
function adminNote(body) {
  const note = str(body.note).trim().replace(/\s+/g, ' ');
  if (!note) throw ApiError.invalid('Add a note: why, and who asked.', 'note');
  if (note.length > 500) throw ApiError.invalid('The note must be at most 500 characters.', 'note');
  return note;
}

// POST /admin/students/:id/deactivate  { reason, institute_id?, note }
// malpractice locks the whole account; left_institute only takes them off
// that institute's list.
export class DeactivateStudentRequest {
  constructor(body = {}) {
    this.reason = body.reason;
    if (this.reason !== 'malpractice' && this.reason !== 'left_institute') {
      throw ApiError.invalid('Pick a reason.', 'reason');
    }
    this.instituteId = null;
    if (this.reason === 'left_institute') {
      const id = Number(body.institute_id);
      if (!Number.isInteger(id) || id < 1 || id > INT_MAX) throw ApiError.invalid('Pick the institute they left.', 'institute_id');
      this.instituteId = id;
    }
    this.note = adminNote(body);
  }
}

// POST /admin/students/:id/reactivate  { note }
export class ReactivateStudentRequest {
  constructor(body = {}) {
    this.note = adminNote(body);
  }
}

// PATCH /admin/students/:id/details  { full_name?, phone_no?, note }
export class StudentDetailsRequest {
  constructor(body = {}) {
    const has = key => Object.prototype.hasOwnProperty.call(body, key);
    this.name = null;
    this.phoneNo = null;
    if (has('full_name')) {
      this.name = normName(body.full_name);
      if (!this.name) throw ApiError.invalid('Enter their full name.', 'full_name');
      if (this.name.length > 80) throw ApiError.invalid('Full name must be at most 80 characters.', 'full_name');
    }
    if (has('phone_no')) {
      this.phoneNo = normPhone(body.phone_no);
      if (!this.phoneNo) throw ApiError.invalid('Enter a 10-digit mobile number.', 'phone_no');
    }
    if (!this.name && !this.phoneNo) throw ApiError.invalid('Change the name or the phone number.', 'full_name');
    this.note = adminNote(body);
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

// POST and PUT /admin/institutes (InstituteInput).
export const INSTITUTE_TYPES = ['school', 'tuition', 'coaching', 'other'];
export class InstituteRequest {
  constructor(body = {}) {
    const text = (key, label, { max = 200, required = false } = {}) => {
      const v = str(body[key]).trim();
      if (required && !v) throw ApiError.invalid(`${label} is required.`, key);
      if (v.length > max) throw ApiError.invalid(`${label} must be at most ${max} characters.`, key);
      return v || null;
    };
    this.name = text('name', 'Institute name', { max: 120, required: true });
    this.institute_code = text('institute_code', 'Institute ID', { max: 20, required: true }).toUpperCase();
    if (!/^[A-Z0-9-]{3,20}$/.test(this.institute_code)) {
      throw ApiError.invalid('Institute ID must be 3–20 letters, digits or dashes.', 'institute_code');
    }
    this.type = body.type;
    if (!INSTITUTE_TYPES.includes(this.type)) {
      throw ApiError.invalid(`Type must be one of: ${INSTITUTE_TYPES.join(', ')}.`, 'type');
    }
    this.address = text('address', 'Address', { max: 500 });
    this.city = text('city', 'City', { max: 80, required: true });
    this.contact_details = text('contact_details', 'Contact details', { max: 255 });
    this.status = body.status === 'suspended' ? 'suspended' : 'active';
    // Students not on the list may ask to join (an admin approves each).
    // true / 'true' or false / 'false'; left out: unchanged on update, off on create.
    const ar = body.accepts_requests;
    this.accepts_requests = ar === true || ar === 'true' ? true : ar === false || ar === 'false' ? false : undefined;
    // Pilot (020_pilot_mode.sql). Each left out (or blank): unchanged on
    // update, the column default on create. The service checks the end time.
    const pm = body.pilot_mode;
    this.pilot_mode = pm === true || pm === 'true' ? true : pm === false || pm === 'false' ? false : undefined;
    const pe = body.pilot_ends_at;
    if (pe == null || pe === '') this.pilot_ends_at = undefined;
    else {
      this.pilot_ends_at = parseDate(pe);
      if (!this.pilot_ends_at) throw ApiError.invalid('Pick when the pilot ends.', 'pilot_ends_at');
    }
    for (const c of [9, 10]) {
      const key = `pilot_seats_class${c}`, v = body[key];
      if (v == null || v === '') { this[key] = undefined; continue; }
      const nSeats = Number(v);
      if (!Number.isInteger(nSeats) || nSeats < 0 || nSeats > PILOT_SEATS_MAX) {
        throw ApiError.invalid(`Class ${c} pilot seats must be a whole number from 0 to ${PILOT_SEATS_MAX}.`, key);
      }
      this[key] = nSeats;
    }
  }
}
const PILOT_SEATS_MAX = 1000;

// 'YYYY-MM-DD' or a full ISO time → Date, else null.
function parseDate(v) {
  const t = typeof v === 'string' && v.trim() ? Date.parse(v) : NaN;
  return Number.isNaN(t) ? null : new Date(t);
}

// POST /admin/institutes/:id/students?head_count=&starts_at=&ends_at=
// The query that goes with an uploaded student list; the body is the file.
export class StudentListUploadQuery {
  constructor(query = {}) {
    this.headCount = Number(query.head_count);
    if (!Number.isInteger(this.headCount) || this.headCount < 1 || this.headCount > 100000) {
      throw ApiError.invalid('Enter the headcount the institute paid for.', 'head_count');
    }
    this.startsAt = parseDate(query.starts_at);
    if (!this.startsAt) throw ApiError.invalid('Pick a start date.', 'starts_at');
    this.endsAt = parseDate(query.ends_at);
    if (!this.endsAt || this.endsAt <= this.startsAt) {
      throw ApiError.invalid('The end date must be after the start date.', 'ends_at');
    }
  }
}

// DELETE /admin/institutes/:id/students?full_name=&phone_no= — one list row.
export class ListRowQuery {
  constructor(query = {}) {
    this.name = normName(query.full_name);
    this.phoneNo = normPhone(query.phone_no);
    if (!this.name || !this.phoneNo) throw ApiError.notFound('student');
  }
}

// POST /admin/institutes/:id/payments — a payment the institute made,
// recorded after its list was uploaded. subscription_id: the upload it pays for.
export class PaymentRequest {
  constructor(body = {}) {
    this.subscriptionId = Number(body.subscription_id);
    if (!Number.isInteger(this.subscriptionId) || this.subscriptionId < 1 || this.subscriptionId > INT_MAX) {
      throw ApiError.invalid('Pick the subscription this payment is for.', 'subscription_id');
    }
    const amount = typeof body.amount === 'string' ? Number(body.amount) : body.amount;
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0 || amount >= 1e10 ||
        Math.round(amount * 100) !== amount * 100) {
      throw ApiError.invalid('Enter the amount paid, in rupees (up to 2 decimals).', 'amount');
    }
    this.amount = amount;
    this.modeOfPayment = str(body.mode_of_payment).trim();
    if (!this.modeOfPayment) throw ApiError.invalid('Enter how they paid (UPI, bank transfer…).', 'mode_of_payment');
    if (this.modeOfPayment.length > 40) {
      throw ApiError.invalid('Mode of payment must be at most 40 characters.', 'mode_of_payment');
    }
    const ref = str(body.transaction_id).trim();
    if (ref.length > 100) throw ApiError.invalid('The transaction ID must be at most 100 characters.', 'transaction_id');
    this.transactionId = ref || null;
    const d = /^\d{4}-\d{2}-\d{2}$/.test(str(body.date_of_payment)) ? parseDate(body.date_of_payment) : null;
    if (!d) throw ApiError.invalid('Pick the date of payment.', 'date_of_payment');
    this.dateOfPayment = str(body.date_of_payment);
  }
}

// PUT /admin/roadmap?career= — { steps, version }. version is the one the
// admin opened (null for a career with no roadmap yet).
export const ROADMAP_LIMITS = { steps: 10, actions: 10, period: 60, title: 150, action: 200 };
export class RoadmapRequest {
  constructor(body = {}) {
    const L = ROADMAP_LIMITS;
    const raw = Array.isArray(body.steps) ? body.steps : [];
    if (!raw.length) throw ApiError.invalid('Add at least one stage.', 'steps');
    if (raw.length > L.steps) throw ApiError.invalid(`A roadmap can have at most ${L.steps} stages.`, 'steps');
    this.steps = raw.map((s, i) => {
      const n = `Stage ${i + 1}`;
      const period = str(s && s.period).trim(), title = str(s && s.title).trim();
      const actions = (Array.isArray(s && s.actions) ? s.actions : []).map(a => str(a).trim()).filter(Boolean);
      if (!period) throw ApiError.invalid(`${n}: enter when it happens (e.g. Class 11–12).`, 'steps');
      if (period.length > L.period) throw ApiError.invalid(`${n}: "when" must be at most ${L.period} characters.`, 'steps');
      if (!title) throw ApiError.invalid(`${n}: enter a title.`, 'steps');
      if (title.length > L.title) throw ApiError.invalid(`${n}: the title must be at most ${L.title} characters.`, 'steps');
      if (!actions.length) throw ApiError.invalid(`${n}: add at least one action.`, 'steps');
      if (actions.length > L.actions) throw ApiError.invalid(`${n}: at most ${L.actions} actions.`, 'steps');
      if (actions.some(a => a.length > L.action)) {
        throw ApiError.invalid(`${n}: each action must be at most ${L.action} characters.`, 'steps');
      }
      return { period, title, actions };
    });

    const v = body.version;
    this.version = v === null || v === undefined ? null : Number(v);
    if (this.version !== null && (!Number.isInteger(this.version) || this.version < 1)) {
      throw ApiError.invalid('version must be a positive integer or null.', 'version');
    }
  }
}
