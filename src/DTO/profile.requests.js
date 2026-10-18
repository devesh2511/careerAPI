// Request bodies for PUT /me (name) and PUT /me/profile (onboarding
// answers). Each constructor validates and normalises the raw input,
// throwing ApiError (400 with the bad field) when it's wrong.
import { ApiError } from './ApiError.js';
import { str } from './auth.requests.js';

const BOARDS = ['CBSE', 'ICSE', 'State Board'];
const MEDIUMS = ['English', 'Hindi', 'Regional Language'];
const PREFERENCES = ['Private Sector', 'Government Job', 'Entrepreneur'];
const LOCATIONS = ['Yes, anywhere', 'Same state only', 'Prefer home city'];
const LIST_MAX = 20;
const TEXT_MAX = 80;

const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const clean = v => str(v).trim().replace(/\s+/g, ' ');

// PUT /me
export class NameRequest {
  constructor(body = {}) {
    this.fullName = clean(body.full_name);
    if (!this.fullName) throw ApiError.invalid('Please enter your full name.', 'full_name');
    if (this.fullName.length > TEXT_MAX) throw ApiError.invalid('Full name must be at most 80 characters.', 'full_name');
  }
}

// PUT /me/profile. class is always required; every other answer is only
// changed when its key is in the body (null clears it), so each onboarding
// step and the Settings editor can save just their own fields.
export class ProfileRequest {
  constructor(body = {}) {
    if (!isObject(body)) throw ApiError.invalid('Send the profile as a JSON object.');
    this.fields = {};

    if (body.class !== 9 && body.class !== 10) throw ApiError.invalid('class must be 9 or 10.', 'class');
    this.fields.class = body.class;

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

    oneOf('board', BOARDS);
    oneOf('medium', MEDIUMS);
    text('city');
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
