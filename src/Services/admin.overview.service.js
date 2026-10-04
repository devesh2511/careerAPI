// The numbers on the admin home screen.
import { countAccess } from '../Database/student.repository.js';
import { countPaying } from '../Database/school.repository.js';
import * as contests from '../Database/contest.repository.js';
import { AdminContestDTO } from '../DTO/AdminContestDTO.js';

export async function overview() {
  const [access, schools, next, drafts] = await Promise.all([
    countAccess(), countPaying(), contests.listNotClosed(3), contests.listDrafts(),
  ]);
  return {
    ...access,
    ...schools,
    next_contests: next.map(c => new AdminContestDTO(c)),
    drafts_needing_questions: drafts.map(c => new AdminContestDTO(c)),
  };
}
