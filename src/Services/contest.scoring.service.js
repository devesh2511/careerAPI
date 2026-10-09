// The close job (schema §9): auto-submit unfinished attempts and score
// every attempt of a closed contest. There is no scheduler; every endpoint
// that shows results calls ensureScored() first, so results are right as
// soon as the contest closes, however late anything else runs.
import { withTransaction } from '../Database/db.js';
import * as contests from '../Database/contest.repository.js';
import * as attempts from '../Database/attempt.repository.js';

export async function ensureScored() {
  for (const id of await contests.listUnscored()) await scoreContest(id);
}

// One transaction per contest. The row lock makes concurrent callers wait,
// then find it already scored and do nothing.
export function scoreContest(contestId) {
  return withTransaction(async db => {
    if (!(await contests.lockForScoring(contestId, db))) return;
    await attempts.scoreContest(contestId, db);
    await contests.markScored(contestId, db);
  });
}
