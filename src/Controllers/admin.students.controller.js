// Students (docs/openapi.yaml → Admin · Students), at /admin/students.
import { Router } from 'express';
import { uuidId, listDeleted, deleteMode, searchPattern } from '../DTO/admin.requests.js';
import * as students from '../Services/admin.student.service.js';

export const adminStudentsController = Router();
const studentId = req => uuidId(req.params.id, 'student');

adminStudentsController.get('/', async (req, res) => {
  res.json(await students.list({ deleted: listDeleted(req.query), pattern: searchPattern(req.query) }));
});

adminStudentsController.delete('/:id', async (req, res) => {
  await students.remove(studentId(req), deleteMode(req.query));
  res.json({ ok: true });
});

adminStudentsController.post('/:id/restore', async (req, res) => {
  await students.restore(studentId(req));
  res.json({ ok: true });
});
