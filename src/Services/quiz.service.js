// Saving and reloading the student's career quiz results (schema §4.2).
import { withTransaction } from '../Database/db.js';
import * as quiz from '../Database/quiz.repository.js';
import * as students from '../Database/student.repository.js';
import { QuizResultDTO } from '../DTO/QuizResultDTO.js';

// Only the newest runs are kept, to keep the table small.
export const RUNS_KEPT = 2;

// req: CareerQuizRequest. Saving the run, dropping the older ones and
// moving the student's career to its top career happen together. The
// career update goes first: it locks the student's row, so two saves at
// once queue up instead of both keeping their own 2 newest.
export async function saveRun(studentId, req) {
  return withTransaction(async db => {
    const student = await students.setCareer(studentId, req.topCareer, db);
    const row = await quiz.insert(studentId, req, db);
    await quiz.deleteAllButNewest(studentId, RUNS_KEPT, db);
    return { id: Number(row.id), current_career: student.current_career };
  });
}

// GET /me/career-quiz/latest. null when the student hasn't taken the quiz.
export async function latestRun(studentId) {
  const row = await quiz.findLatest(studentId);
  return { result: row ? new QuizResultDTO(row) : null };
}
