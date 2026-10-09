// The logged-in student (docs/openapi.yaml → Me). GET /me, /me/access and
// PUT /me/school are free: the paywall needs them before the student has access.
//   GET /me   GET /me/access   PUT /me/school
//   PUT /me/career (paid)   GET /me/contest-history (paid)
//   POST /me/career-quiz (paid)   GET /me/career-quiz/latest (paid)
//   GET /me/career-quiz/runs (paid)
import { Router } from 'express';
import { requireStudent, requireAccess } from './session.cookie.js';
import { CareerRequest } from '../DTO/contest.requests.js';
import { CareerQuizRequest } from '../DTO/quiz.requests.js';
import { SchoolCodeRequest } from '../DTO/auth.requests.js';
import { accessFor } from '../Services/access.service.js';
import { toStudentDTO, setCareer, setSchool } from '../Services/student.service.js';
import { history } from '../Services/contest.service.js';
import { saveRun, latestRun, savedRuns } from '../Services/quiz.service.js';

export const meController = Router();
meController.use(requireStudent);

meController.get('/', async (req, res) => {
  res.json({ student: await toStudentDTO(req.student) });
});

meController.get('/access', async (req, res) => {
  res.json(await accessFor(req.student.id));
});

meController.put('/school', async (req, res) => {
  res.json(await setSchool(req.student.id, new SchoolCodeRequest(req.body)));
});

// Career leaderboards group by this (contest spec §4.8).
meController.put('/career', requireAccess, async (req, res) => {
  await setCareer(req.student.id, new CareerRequest(req.body));
  res.json({ ok: true });
});

meController.get('/contest-history', requireAccess, async (req, res) => {
  res.json(await history(req.student));
});

// Keeps the student's latest 2 runs; saving one also sets their career.
meController.post('/career-quiz', requireAccess, async (req, res) => {
  res.status(201).json(await saveRun(req.student.id, new CareerQuizRequest(req.body)));
});

// What the dashboard and Career Matches show after login.
meController.get('/career-quiz/latest', requireAccess, async (req, res) => {
  res.json(await latestRun(req.student.id));
});

// Both kept runs, newest first — Progress → Top Match Evolution.
meController.get('/career-quiz/runs', requireAccess, async (req, res) => {
  res.json(await savedRuns(req.student.id));
});
