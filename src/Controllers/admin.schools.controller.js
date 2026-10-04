// Schools, their email lists and payments (docs/openapi.yaml → Admin · Schools),
// at /admin/schools.
import express, { Router } from 'express';
import {
  SchoolRequest, SchoolSubscriptionRequest, intId, listDeleted, deleteMode, searchPattern,
} from '../DTO/admin.requests.js';
import * as schools from '../Services/admin.school.service.js';

export const adminSchoolsController = Router();
const schoolId = req => intId(req.params.id, 'school');

adminSchoolsController.get('/', async (req, res) => {
  res.json(await schools.list({ deleted: listDeleted(req.query), pattern: searchPattern(req.query) }));
});

adminSchoolsController.post('/', async (req, res) => {
  res.status(201).json(await schools.create(new SchoolRequest(req.body), req.admin.id));
});

adminSchoolsController.get('/:id', async (req, res) => {
  res.json(await schools.get(schoolId(req)));
});

adminSchoolsController.put('/:id', async (req, res) => {
  const id = schoolId(req);
  res.json(await schools.update(id, new SchoolRequest(req.body)));
});

adminSchoolsController.delete('/:id', async (req, res) => {
  await schools.remove(schoolId(req), deleteMode(req.query));
  res.json({ ok: true });
});

adminSchoolsController.post('/:id/restore', async (req, res) => {
  res.json(await schools.restore(schoolId(req)));
});

adminSchoolsController.get('/:id/roster', async (req, res) => {
  res.json(await schools.listRoster(schoolId(req)));
});

// The body is CSV text, not JSON.
adminSchoolsController.post('/:id/roster',
  express.text({ type: ['text/csv', 'text/plain'], limit: '1mb' }),
  async (req, res) => {
    const text = typeof req.body === 'string' ? req.body : '';
    res.json(await schools.uploadRoster(schoolId(req), text, req.admin.id));
  });

adminSchoolsController.delete('/:id/roster/:email', async (req, res) => {
  await schools.removeFromRoster(schoolId(req), req.params.email);
  res.json({ ok: true });
});

adminSchoolsController.get('/:id/subscriptions', async (req, res) => {
  res.json(await schools.listSubscriptions(schoolId(req)));
});

adminSchoolsController.post('/:id/subscriptions', async (req, res) => {
  const id = schoolId(req);
  res.status(201).json(await schools.recordPayment(id, new SchoolSubscriptionRequest(req.body)));
});
