// Students (docs/openapi.yaml → Admin · Students), at /admin/students.
import { Router } from 'express';
import {
  uuidId, listDeleted, deleteMode, searchPattern, SetStudentPasswordRequest, StudentSubscriptionRequest,
} from '../DTO/admin.requests.js';
import * as students from '../Services/admin.student.service.js';

export const adminStudentsController = Router();
const studentId = req => uuidId(req.params.id, 'student');

adminStudentsController.get('/', async (req, res) => {
  res.json(await students.list({ deleted: listDeleted(req.query), pattern: searchPattern(req.query) }));
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

// Sets a new password and signs the student out everywhere.
adminStudentsController.post('/:id/password', async (req, res) => {
  await students.setPassword(studentId(req), new SetStudentPasswordRequest(req.body));
  res.json({ ok: true });
});

// Individual plans, paid outside the website and recorded here.
adminStudentsController.get('/:id/subscriptions', async (req, res) => {
  res.json(await students.listSubscriptions(studentId(req)));
});

adminStudentsController.post('/:id/subscriptions', async (req, res) => {
  const id = studentId(req);
  res.status(201).json(await students.recordPayment(id, new StudentSubscriptionRequest(req.body)));
});
