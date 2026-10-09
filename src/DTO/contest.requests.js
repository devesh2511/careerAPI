// Request bodies and parameters for the student contest endpoints and
// PUT /me/career. Each constructor validates and normalises the raw input,
// throwing ApiError (400 with the bad field) when it's wrong.
import { ApiError } from './ApiError.js';
import { str } from './auth.requests.js';
import { intId } from './admin.requests.js';
import { QUESTION_COUNT } from './ContestDTO.js';

export const contestId = value => intId(value, 'contest');

// PUT /contest/:id/attempt/answers/:questionId
export class AnswerRequest {
  constructor(contestId, questionId, body = {}) {
    // Question ids are 'c{contest}-q{position}'; any other id isn't in this contest.
    const m = /^c(\d+)-q(\d+)$/.exec(String(questionId));
    if (!m || Number(m[1]) !== contestId || Number(m[2]) < 1 || Number(m[2]) > QUESTION_COUNT) {
      throw new ApiError(400, 'bad_question', 'That question is not in this contest.');
    }
    this.questionId = questionId;

    this.optionIndex = body.option_index;
    if (!Number.isInteger(this.optionIndex) || this.optionIndex < 0 || this.optionIndex > 3) {
      throw ApiError.invalid('option_index must be 0, 1, 2 or 3.', 'option_index');
    }
  }
}

// GET /leaderboard?scope=&period=&contest_id=&limit=
export class LeaderboardQuery {
  constructor(query = {}) {
    this.scope = query.scope ?? 'global';
    if (this.scope !== 'global' && this.scope !== 'career') {
      throw ApiError.invalid('scope must be global or career.', 'scope');
    }
    this.period = query.period ?? 'week';
    if (this.period !== 'week' && this.period !== 'live') {
      throw ApiError.invalid('period must be week or live.', 'period');
    }
    this.contestId = query.contest_id == null || query.contest_id === '' ? null : contestId(query.contest_id);

    const limit = query.limit == null || query.limit === '' ? 10 : Number(query.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw ApiError.invalid('limit must be a whole number from 1 to 100.', 'limit');
    }
    this.limit = limit;
  }
}

// PUT /me/career
export class CareerRequest {
  constructor(body = {}) {
    this.career = str(body.career).trim().replace(/\s+/g, ' ');
    if (!this.career) throw ApiError.invalid('Enter a career.', 'career');
    if (this.career.length > 80) throw ApiError.invalid('Career must be at most 80 characters.', 'career');
  }
}
