// The admin panel's API (docs/openapi.yaml → Admin *), mounted at /admin.
//   POST /admin/auth/login   POST /admin/auth/logout   GET /admin/me
//   GET  /admin/overview
//   /admin/contests/*  /admin/schools/*  /admin/students/*  /admin/admins/*
// Everything but login and logout needs an admin session.
import { Router } from 'express';
import { LoginRequest } from '../DTO/auth.requests.js';
import { AdminRefDTO } from '../DTO/AdminDTO.js';
import * as adminAuth from '../Services/admin.auth.service.js';
import { overview } from '../Services/admin.overview.service.js';
import { setAdminCookie, clearAdminCookie, readAdminCookie, requireAdmin } from './admin.cookie.js';
import { adminContestsController } from './admin.contests.controller.js';
import { adminSchoolsController } from './admin.schools.controller.js';
import { adminStudentsController } from './admin.students.controller.js';
import { adminAdminsController } from './admin.admins.controller.js';

export const adminController = Router();

adminController.post('/auth/login', async (req, res) => {
  const { token, body } = await adminAuth.login(new LoginRequest(req.body), req.get('user-agent'));
  setAdminCookie(res, token);
  res.json(body);
});

adminController.post('/auth/logout', async (req, res) => {
  await adminAuth.logout(readAdminCookie(req));
  clearAdminCookie(res);
  res.json({ ok: true });
});

adminController.get('/me', requireAdmin, (req, res) => {
  res.json({ admin: new AdminRefDTO(req.admin) });
});

adminController.get('/overview', requireAdmin, async (_req, res) => {
  res.json(await overview());
});

adminController.use('/contests', requireAdmin, adminContestsController);
adminController.use('/schools', requireAdmin, adminSchoolsController);
adminController.use('/students', requireAdmin, adminStudentsController);
adminController.use('/admins', requireAdmin, adminAdminsController);
