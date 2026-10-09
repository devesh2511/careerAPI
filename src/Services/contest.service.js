// The weekly contest from the student's side (contest spec §2, §4): start
// or resume the one attempt, save answers, submit, and the results once
// the contest has closed. Open/closed and time taken always come from the
// database's clock. Nothing about scores or answers leaves before close.
import { withTransaction } from '../Database/db.js';
import * as contests from '../Database/contest.repository.js';
import * as attempts from '../Database/attempt.repository.js';
import * as leaderboards from '../Database/leaderboard.repository.js';
import { ApiError } from '../DTO/ApiError.js';
import { ContestDTO, PublicQuestionDTO, ReviewQuestionDTO, QUESTION_COUNT, rankOrNull } from '../DTO/ContestDTO.js';
import { ensureScored } from './contest.scoring.service.js';

const notOpen = () => new ApiError(403, 'not_open', 'This contest is not open.');
const notStarted = () => new ApiError(409, 'not_started', 'Start the contest first.');
const alreadySubmitted = () => new ApiError(409, 'already_submitted', 'You have already submitted this contest.');
const notPublished = () => new ApiError(403, 'not_published', 'Results are published when the contest closes.');

async function visibleContest(contestId, db) {
  const c = await contests.findVisible(contestId, db);
  if (!c) throw ApiError.notFound('contest');
  return c;
}

const attemptStatus = a => (!a ? 'not_started' : a.submitted_at ? 'submitted' : 'in_progress');

// GET /contest/state
export async function state(student) {
  const [contest, latest, publishedCount] = await Promise.all([
    contests.currentOrNext(), contests.latestClosed(), contests.countClosed(),
  ]);
  const a = contest ? await attempts.find(contest.id, student.id) : null;
  return {
    server_time: new Date().toISOString(),
    contest: ContestDTO.orNull(contest),
    attempt: {
      status: attemptStatus(a),
      started_at: a?.started_at ?? null,
      submitted_at: a?.submitted_at ?? null,
      answered_count: a?.answered_count ?? 0,
      auto_submitted: a?.auto_submitted ?? false,
    },
    latest_published: ContestDTO.orNull(latest),
    published_count: publishedCount,
    career: student.current_career,
  };
}

// POST /contest/:id/attempt. Starts the clock, or resumes the attempt.
export async function start(contestId, studentId) {
  const c = await visibleContest(contestId);
  if (c.state !== 'open') throw notOpen();

  await attempts.start(contestId, studentId);
  const a = await attempts.find(contestId, studentId);
  if (a.submitted_at) throw alreadySubmitted();

  const [questions, answers] = await Promise.all([
    contests.publicQuestions(contestId), attempts.answers(a.id),
  ]);
  return {
    contest: new ContestDTO(c),
    started_at: a.started_at,
    questions: questions.map(q => new PublicQuestionDTO(q)),
    answers,
  };
}

// PUT /contest/:id/attempt/answers/:questionId. req: AnswerRequest.
export function saveAnswer(contestId, studentId, req) {
  return withTransaction(async db => {
    const c = await visibleContest(contestId, db);
    if (c.state !== 'open') throw notOpen();
    const a = await attempts.lock(contestId, studentId, db);
    if (!a) throw notStarted();
    if (a.submitted_at) throw alreadySubmitted();
    try {
      await attempts.saveAnswer({ attemptId: a.id, contestId, questionId: req.questionId, optionIndex: req.optionIndex }, db);
    } catch (err) {
      if (err.code === '23503') throw new ApiError(400, 'bad_question', 'That question is not in this contest.');
      throw err;
    }
  });
}

// POST /contest/:id/attempt/submit. Idempotent: submitting again returns
// the original submission, even after close.
export function submit(contestId, studentId) {
  return withTransaction(async db => {
    const c = await visibleContest(contestId, db);
    const a = await attempts.lock(contestId, studentId, db);
    if (!a) throw c.state === 'open' ? notStarted() : notOpen();
    const done = a.submitted_at ? a : await submitOpen(c, a, db);
    return { submitted_at: done.submitted_at, time_taken_s: done.time_taken_s, results_at: c.closes_at };
  });
}

// After close the close job auto-submits instead.
function submitOpen(c, a, db) {
  if (c.state !== 'open') throw notOpen();
  return attempts.submit(a.id, db);
}

// GET /contest/:id/review. Anyone may see the answers after close.
export async function review(contestId, student) {
  const c = await visibleContest(contestId);
  if (c.state !== 'closed') throw notPublished();
  await ensureScored();

  const career = student.current_career;
  const [questions, [mine]] = await Promise.all([
    contests.reviewQuestions(contestId, student.id),
    leaderboards.results({ studentId: student.id, career, contestId }),
  ]);
  return {
    contest: new ContestDTO(c),
    ...result(mine),
    career: mine && career ? { name: career, rank: mine.career_rank, total: mine.career_total } : null,
    questions: questions.map(q => new ReviewQuestionDTO(q)),
  };
}

// GET /me/contest-history. Every closed contest, newest first; career
// ranks use the current career.
export async function history(student) {
  await ensureScored();
  const career = student.current_career;
  const [closed, mine] = await Promise.all([
    contests.listClosed(),
    leaderboards.results({ studentId: student.id, career }),
  ]);
  const byContest = new Map(mine.map(r => [r.contest_id, r]));
  return {
    career,
    rows: closed.map(c => {
      const r = byContest.get(c.id);
      return {
        contest: new ContestDTO(c),
        ...result(r),
        career: r && career ? rankOrNull(r.career_rank, r.career_total) : null,
      };
    }),
  };
}

// The fields review and history share. r: a leaderboards.results() row, or
// undefined when the student didn't take part.
function result(r) {
  return {
    attempted: Boolean(r),
    score: r?.score ?? null,
    correct: r?.correct ?? null,
    total_questions: QUESTION_COUNT,
    time_taken_s: r?.time_taken_s ?? null,
    global: r ? rankOrNull(r.global_rank, r.global_total) : null,
  };
}
