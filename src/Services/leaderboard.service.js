// GET /leaderboard (contest spec §4.6): global or career, one closed week
// or Live (every closed contest). The open contest never appears. A career
// board can be any of the student's suggested careers; the student is
// always ranked on it, even when it isn't their current career.
import * as contests from '../Database/contest.repository.js';
import * as leaderboards from '../Database/leaderboard.repository.js';
import { ApiError } from '../DTO/ApiError.js';
import { ContestDTO, LeaderboardRowDTO } from '../DTO/ContestDTO.js';
import { ensureScored } from './contest.scoring.service.js';
import { suggestedCareers } from './quiz.service.js';

// q: LeaderboardQuery.
export async function leaderboard(q, student) {
  const live = q.period === 'live';
  const career = q.scope === 'career' ? q.career ?? student.current_career : null;
  if (q.career && q.career !== student.current_career && !(await suggestedCareers(student)).includes(q.career)) {
    throw ApiError.invalid('career must be one of your suggested careers.', 'career');
  }
  const body = { scope: q.scope, period: q.period };
  if (q.scope === 'career') body.career = career;

  let contest = null;
  if (live) {
    body.contests_count = await contests.countClosed();
  } else {
    contest = q.contestId ? await contests.findVisible(q.contestId) : await contests.latestClosed();
    if (q.contestId && !contest) throw ApiError.notFound('contest');
    if (contest && contest.state !== 'closed') {
      throw new ApiError(403, 'not_published', 'Results are published when the contest closes.');
    }
    body.contest = ContestDTO.orNull(contest);
  }

  if (q.scope === 'career' && !career) {
    return { ...body, total_participants: 0, me: null, rows: [], locked: 'no_career' };
  }
  if (!live && !contest) return { ...body, total_participants: 0, me: null, rows: [] };

  await ensureScored();
  const b = await leaderboards.board({ contestId: contest?.id ?? null, career, studentId: student.id, limit: q.limit });
  return {
    ...body,
    total_participants: b.total,
    me: b.me ? new LeaderboardRowDTO(b.me, live) : null,
    rows: b.rows.map(r => new LeaderboardRowDTO(r, live)),
  };
}
