// Roadmap editing (docs/openapi.yaml → Admin · Roadmaps).
//   GET /admin/roadmaps
//   GET /admin/roadmap?career=   PUT /admin/roadmap?career=   DELETE /admin/roadmap?career=
// The career is a query parameter: titles like "UI/UX Designer" contain a slash.
import { Router } from 'express';
import { requireAdmin } from './admin.cookie.js';
import { CareerRequest } from '../DTO/contest.requests.js';
import { RoadmapRequest } from '../DTO/admin.requests.js';
import * as adminRoadmaps from '../Services/admin.roadmap.service.js';

export const adminRoadmapsController = Router();

adminRoadmapsController.get('/roadmaps', requireAdmin, async (_req, res) => {
  res.json(await adminRoadmaps.list());
});

adminRoadmapsController.get('/roadmap', requireAdmin, async (req, res) => {
  res.json(await adminRoadmaps.get(new CareerRequest(req.query)));
});

adminRoadmapsController.put('/roadmap', requireAdmin, async (req, res) => {
  res.json(await adminRoadmaps.save(new CareerRequest(req.query), new RoadmapRequest(req.body), req.admin.id));
});

adminRoadmapsController.delete('/roadmap', requireAdmin, async (req, res) => {
  await adminRoadmaps.remove(new CareerRequest(req.query));
  res.json({ ok: true });
});
