// Institutes, their student lists, subscriptions and payments
// (docs/openapi.yaml → Admin · Institutes), at /admin/institutes.
import express, { Router } from 'express';
import {
  InstituteRequest, StudentListUploadQuery, ListRowQuery, PaymentRequest,
  intId, listDeleted, deleteMode, searchPattern,
} from '../DTO/admin.requests.js';
import * as institutes from '../Services/admin.institute.service.js';

export const adminInstitutesController = Router();
const instituteId = req => intId(req.params.id, 'institute');

adminInstitutesController.get('/', async (req, res) => {
  res.json(await institutes.list({ deleted: listDeleted(req.query), pattern: searchPattern(req.query) }));
});

adminInstitutesController.post('/', async (req, res) => {
  res.status(201).json(await institutes.create(new InstituteRequest(req.body), req.admin.id));
});

adminInstitutesController.get('/:id', async (req, res) => {
  res.json(await institutes.get(instituteId(req)));
});

adminInstitutesController.put('/:id', async (req, res) => {
  const id = instituteId(req);
  res.json(await institutes.update(id, new InstituteRequest(req.body)));
});

adminInstitutesController.delete('/:id', async (req, res) => {
  await institutes.remove(instituteId(req), deleteMode(req.query));
  res.json({ ok: true });
});

adminInstitutesController.post('/:id/restore', async (req, res) => {
  res.json(await institutes.restore(instituteId(req)));
});

adminInstitutesController.get('/:id/students', async (req, res) => {
  res.json(await institutes.listStudents(instituteId(req)));
});

// The body is the .xlsx or .csv file itself; headcount and dates are in the query.
adminInstitutesController.post('/:id/students',
  express.raw({ type: () => true, limit: '5mb' }),
  async (req, res) => {
    const id = instituteId(req);
    const q = new StudentListUploadQuery(req.query);
    const buf = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    res.status(201).json(await institutes.uploadStudents(id, buf, q, req.admin.id));
  });

// One row, by ?full_name=&phone_no= (the row's key within the institute).
adminInstitutesController.delete('/:id/students', async (req, res) => {
  await institutes.removeStudent(instituteId(req), new ListRowQuery(req.query));
  res.json({ ok: true });
});

// Join requests from students not on the list (institutes with accepts_requests).
const requestId = req => intId(req.params.requestId, 'request');

adminInstitutesController.get('/:id/requests', async (req, res) => {
  res.json(await institutes.listRequests(instituteId(req)));
});

adminInstitutesController.post('/:id/requests/:requestId/approve', async (req, res) => {
  const id = instituteId(req);
  res.json(await institutes.approveRequest(id, requestId(req), req.admin.id));
});

// Reject.
adminInstitutesController.delete('/:id/requests/:requestId', async (req, res) => {
  const id = instituteId(req);
  await institutes.rejectRequest(id, requestId(req));
  res.json({ ok: true });
});

adminInstitutesController.get('/:id/subscriptions', async (req, res) => {
  res.json(await institutes.listSubscriptions(instituteId(req)));
});

adminInstitutesController.get('/:id/payments', async (req, res) => {
  res.json(await institutes.listPayments(instituteId(req)));
});

adminInstitutesController.post('/:id/payments', async (req, res) => {
  const id = instituteId(req);
  res.status(201).json(await institutes.recordPayment(id, new PaymentRequest(req.body), req.admin.id));
});
