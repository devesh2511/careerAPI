// Authoring weekly contests (schema §5): create a draft for a Saturday,
// fill in 5 questions, schedule. Nothing about a contest's questions can
// change once it has opened.
import { withTransaction } from '../Database/db.js';
import * as contests from '../Database/contest.repository.js';
import { ApiError } from '../DTO/ApiError.js';
import { AdminContestDTO, AdminContestDetailDTO } from '../DTO/AdminContestDTO.js';

const weekTaken = () => new ApiError(409, 'week_taken', 'There is already a contest that week.', 'date');
const contestLocked = () => new ApiError(409, 'contest_locked',
  'This contest has opened, so its questions can no longer change.');

// An overlapping live contest (contests_no_overlap) becomes week_taken.
async function guardWeek(fn) {
  try {
    return await fn();
  } catch (err) {
    if (err.code === '23P01' && err.constraint === 'contests_no_overlap') throw weekTaken();
    throw err;
  }
}

export async function list(deleted) {
  return (await contests.list(deleted)).map(c => new AdminContestDTO(c));
}

export async function detail(contestId, db) {
  const row = await contests.find(contestId, db);
  if (!row) throw ApiError.notFound('contest');
  return new AdminContestDetailDTO(row, await contests.questions(contestId, db));
}

// req: CreateContestRequest.
export async function create(req, adminId) {
  const id = await guardWeek(() => contests.insert({ opensAt: req.opensAt, adminId }));
  return detail(id);
}

// Runs fn inside a transaction holding the contest's row lock, after
// checking it exists and hasn't opened. Returns the updated detail.
function editUnopened(contestId, fn) {
  return withTransaction(async db => {
    const c = await contests.lockForEdit(contestId, db);
    if (!c) throw ApiError.notFound('contest');
    if (c.locked) throw contestLocked();
    await fn(c, db);
    return detail(contestId, db);
  });
}

// req: QuestionRequest.
export function saveQuestion(contestId, req) {
  return editUnopened(contestId, (_c, db) => contests.upsertQuestion(contestId, req, db));
}

export function schedule(contestId) {
  return editUnopened(contestId, async (c, db) => {
    if (c.question_count !== 5) {
      throw new ApiError(409, 'needs_5_questions', 'Add all 5 questions before scheduling.');
    }
    await contests.setStatus(contestId, 'scheduled', db);
  });
}

export function unschedule(contestId) {
  return editUnopened(contestId, (_c, db) => contests.setStatus(contestId, 'draft', db));
}

// Hard delete only before it opens; after that it has (or will have)
// attempts, so it can only be soft-deleted.
export async function remove(contestId, mode) {
  await withTransaction(async db => {
    const c = await contests.lockForEdit(contestId, db);
    if (!c) throw ApiError.notFound('contest');
    if (mode === 'soft') return contests.softDelete(contestId, db);
    if (c.locked) {
      throw new ApiError(409, 'contest_locked',
        'An opened contest can only be soft-deleted, because students have attempts on it.');
    }
    await contests.hardDelete(contestId, db);
  });
}

export async function restore(contestId) {
  if (!(await contests.find(contestId))) throw ApiError.notFound('contest');
  await guardWeek(() => contests.restore(contestId));
  return new AdminContestDTO(await contests.find(contestId));
}
