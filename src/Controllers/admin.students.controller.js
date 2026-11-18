// Student accounts (docs/openapi.yaml → Admin · Students), at /admin/students.
import { Router } from 'express';
import {
  intId, listDeleted, deleteMode, searchPattern, SetStudentPasswordRequest,
  DeactivateStudentRequest, ReactivateStudentRequest, StudentDetailsRequest,
} from '../DTO/admin.requests.js';
import * as students from '../Services/admin.student.service.js';

export const adminStudentsController = Router();
const studentId = req => intId(req.params.id, 'student');

// ?deleted=true: the Deleted tab. ?deactivated=true: the Deactivated tab.
adminStudentsController.get('/', async (req, res) => {
  const deactivated = req.query.deactivated === 'true' || req.query.deactivated === '1';
  res.json(await students.list({ deleted: listDeleted(req.query), deactivated, pattern: searchPattern(req.query) }));
});

adminStudentsController.get('/:id', async (req, res) => {
  res.json(await students.get(studentId(req)));
});

adminStudentsController.delete('/:id', async (req, res) => {
  await students.remove(studentId(req), deleteMode(req.query));
  res.json({ ok: true });
});

adminStudentsController.post('/:id/restore', async (req, res) => {
  await students.restore(studentId(req));
  res.json({ ok: true });
});

// Sets a new password and signs the student out everywhere. The way back in
// for a student with no confirmed email.
adminStudentsController.post('/:id/password', async (req, res) => {
  await students.setPassword(studentId(req), new SetStudentPasswordRequest(req.body), req.admin.id);
  res.json({ ok: true });
});

// Malpractice (whole account locked) or left an institute (off its list).
adminStudentsController.post('/:id/deactivate', async (req, res) => {
  res.json(await students.deactivate(studentId(req), new DeactivateStudentRequest(req.body), req.admin.id));
});

adminStudentsController.post('/:id/reactivate', async (req, res) => {
  res.json(await students.reactivate(studentId(req), new ReactivateStudentRequest(req.body), req.admin.id));
});

// Corrects the name and/or phone, on the account and every list it's on.
adminStudentsController.patch('/:id/details', async (req, res) => {
  res.json(await students.editDetails(studentId(req), new StudentDetailsRequest(req.body), req.admin.id));
});
