// The logged-in student (docs/openapi.yaml → Me). GET /me, /me/access and
// PUT /me/school are free: the paywall needs them before the student has access.
//   GET /me   GET /me/access   PUT /me/school
//   PUT /me/career (paid)   GET /me/contest-history (paid)
import { Router } from 'express';
import { requireStudent, requireAccess } from './session.cookie.js';
import { CareerRequest } from '../DTO/contest.requests.js';
import { SchoolCodeRequest } from '../DTO/auth.requests.js';
import { accessFor } from '../Services/access.service.js';
import { toStudentDTO, setCareer, setSchool } from '../Services/student.service.js';
import { history } from '../Services/contest.service.js';

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
