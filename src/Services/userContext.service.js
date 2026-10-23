// GET /userContext: one student's profile, top career matches and contest
// results in a single answer, for trusted server-side callers.
import * as students from '../Database/student.repository.js';
import { ApiError } from '../DTO/ApiError.js';
import { getProfile } from './student.service.js';
import { latestRun } from './quiz.service.js';
import { history } from './contest.service.js';

const TOP_CAREERS = 5;

// req: UserContextRequest.
export async function userContext(req) {
  const student = await students.findLiveByEmail(req.email);
  if (!student) throw ApiError.notFound('student');
  const [{ profile }, { result }, contests] = await Promise.all([
    getProfile(student.id), latestRun(student.id), history(student),
  ]);
  const careers = Array.isArray(result?.results?.top_careers) ? result.results.top_careers : [];
  return {
    email: student.email,
    full_name: student.full_name,
    //current_career: student.current_career,
    profile,
    top_careers: careers.slice(0, TOP_CAREERS),
    contest_scores: contests.rows,
  };
}
