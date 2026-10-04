// The logged-in student (docs/openapi.yaml → Me). Both are free endpoints:
// the paywall needs them before the student has access.
//   GET /me   GET /me/access
import { Router } from 'express';
import { requireStudent } from './session.cookie.js';
import { accessFor } from '../Services/access.service.js';
import { toStudentDTO } from '../Services/student.service.js';

export const meController = Router();
meController.use(requireStudent);

meController.get('/', async (req, res) => {
  res.json({ student: await toStudentDTO(req.student) });
});

meController.get('/access', async (req, res) => {
  res.json(await accessFor(req.student.id));
});
