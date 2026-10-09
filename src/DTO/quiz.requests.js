// Request body for POST /me/career-quiz. The constructor validates and
// normalises the raw input, throwing ApiError (400 with the bad field) when
// it's wrong.
import { ApiError } from './ApiError.js';
import { str } from './auth.requests.js';
import { CareerRequest } from './contest.requests.js';

const DIMS = ['R', 'I', 'A', 'S', 'E', 'C'];
const CONFIDENCE = ['high', 'medium', 'low'];

const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);

export class CareerQuizRequest {
  constructor(body = {}) {
    const pct = body.riasec_pct;
    if (!isObject(pct) || Object.keys(pct).length !== DIMS.length ||
        !DIMS.every(d => Number.isInteger(pct[d]) && pct[d] >= 0 && pct[d] <= 100)) {
      throw ApiError.invalid('riasec_pct must give R, I, A, S, E and C as whole numbers from 0 to 100.', 'riasec_pct');
    }
    this.riasecPct = Object.fromEntries(DIMS.map(d => [d, pct[d]]));

    this.riasecCode = str(body.riasec_code).trim().toUpperCase();
    if (!/^[RIASEC]{1,3}$/.test(this.riasecCode)) {
      throw ApiError.invalid('riasec_code must be up to three of the letters R, I, A, S, E, C.', 'riasec_code');
    }

    this.confidence = body.confidence ?? null;
    if (this.confidence !== null && !CONFIDENCE.includes(this.confidence)) {
      throw ApiError.invalid('confidence must be high, medium or low.', 'confidence');
    }

    try {
      this.topCareer = new CareerRequest({ career: body.top_career }).career;
    } catch (err) {
      err.field = 'top_career';
      throw err;
    }

    if (!isObject(body.results) || !Array.isArray(body.results.top_careers)) {
      throw ApiError.invalid('results must be the quiz results object, with top_careers.', 'results');
    }
    this.results = body.results;

    this.answers = body.answers ?? null;
    if (this.answers !== null && !Array.isArray(this.answers)) {
      throw ApiError.invalid('answers must be a list.', 'answers');
    }

    this.engineVersion = body.engine_version ?? null;
    if (this.engineVersion !== null && (typeof this.engineVersion !== 'string' || this.engineVersion.length > 40)) {
      throw ApiError.invalid('engine_version must be text of at most 40 characters.', 'engine_version');
    }
  }
}
