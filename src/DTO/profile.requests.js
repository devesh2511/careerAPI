// Request bodies for PUT /me (account details) and PUT /me/profile
// (onboarding answers). Each constructor validates and normalises the raw input,
// throwing ApiError (400 with the bad field) when it's wrong.
import { ApiError } from './ApiError.js';
import { str, accountDetails, optionalEmail } from './auth.requests.js';

const MEDIUMS = ['English', 'Hindi', 'Regional Language'];
const PREFERENCES = ['Private Sector', 'Government Job', 'Entrepreneur'];
const LOCATIONS = ['Yes, anywhere', 'Same state only', 'Prefer home city'];
const LIST_MAX = 20;
const TEXT_MAX = 80;

const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const clean = v => str(v).trim().replace(/\s+/g, ' ');

// PUT /me { email?, class?, board?, city? } — only the given keys change.
// Name and phone can't change here: together they are how the student is
// found on their institutes' lists. email null or '' removes it.
export class AccountRequest {
  constructor(body = {}) {
    if (!isObject(body)) throw ApiError.invalid('Send the details as a JSON object.');
    this.details = accountDetails(body, { partial: true });
    if (Object.prototype.hasOwnProperty.call(body, 'email')) this.details.email = optionalEmail({ email: body.email ?? '' });
    if (!Object.keys(this.details).length) throw ApiError.invalid('Nothing to change.');
  }
}

// PUT /me/profile. Each answer is only changed when its key is in the body
// (null clears it), so each onboarding step and the Settings editor can save
// just their own fields. class, board and city go to the account and can't
// be cleared.
export class ProfileRequest {
  constructor(body = {}) {
    if (!isObject(body)) throw ApiError.invalid('Send the profile as a JSON object.');
    this.fields = {};

    this.details = accountDetails(body, { partial: true });

    const has = key => Object.prototype.hasOwnProperty.call(body, key);
    const oneOf = (key, allowed) => {
      if (!has(key)) return;
      if (body[key] !== null && !allowed.includes(body[key])) {
        throw ApiError.invalid(`${key} must be one of: ${allowed.join(', ')}.`, key);
      }
      this.fields[key] = body[key];
    };
    const text = key => {
      if (!has(key)) return;
      if (body[key] !== null && typeof body[key] !== 'string') throw ApiError.invalid(`${key} must be text.`, key);
      const v = clean(body[key]);
      if (v.length > TEXT_MAX) throw ApiError.invalid(`${key} must be at most ${TEXT_MAX} characters.`, key);
      this.fields[key] = v || null;
    };
    const list = key => {
      if (!has(key)) return;
      const v = body[key];
      if (v !== null && (!Array.isArray(v) || v.length > LIST_MAX ||
          !v.every(x => typeof x === 'string' && clean(x) && clean(x).length <= TEXT_MAX))) {
        throw ApiError.invalid(`${key} must be a list of up to ${LIST_MAX} short names.`, key);
      }
      this.fields[key] = v === null ? null : [...new Set(v.map(clean))];
    };

    oneOf('medium', MEDIUMS);
    if (has('marks')) {
      const m = body.marks;
      if (m !== null && (!isObject(m) || Object.keys(m).length > LIST_MAX ||
          !Object.entries(m).every(([k, n]) => clean(k) && clean(k).length <= TEXT_MAX &&
            typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 100))) {
        throw ApiError.invalid('marks must map each subject to a mark from 0 to 100.', 'marks');
      }
      this.fields.marks = m;
    }
    list('favourite_subjects');
    list('hobbies');
    text('dream_job');
    oneOf('career_preference', PREFERENCES);
    oneOf('study_location', LOCATIONS);
  }
}
