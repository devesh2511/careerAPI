// Admin accounts (docs/openapi.yaml → Admin · Admins), at /admin/admins.
import { Router } from 'express';
import { CreateAdminRequest, uuidId, listDeleted, deleteMode } from '../DTO/admin.requests.js';
import * as admins from '../Services/admin.account.service.js';

export const adminAdminsController = Router();
const adminId = req => uuidId(req.params.id, 'admin');

adminAdminsController.get('/', async (req, res) => {
  res.json(await admins.list(listDeleted(req.query), req.admin.id));
});

adminAdminsController.post('/', async (req, res) => {
  res.status(201).json(await admins.create(new CreateAdminRequest(req.body)));
});

adminAdminsController.delete('/:id', async (req, res) => {
  await admins.remove(adminId(req), deleteMode(req.query), req.admin.id);
  res.json({ ok: true });
});

adminAdminsController.post('/:id/restore', async (req, res) => {
  await admins.restore(adminId(req));
  res.json({ ok: true });
});
