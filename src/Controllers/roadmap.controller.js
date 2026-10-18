// Career roadmaps (docs/openapi.yaml → Roadmap). All paid.
//   GET /roadmaps   GET /roadmap?career=
// The career is a query parameter, not a path segment: titles like
// "UI/UX Designer" contain a slash.
import { Router } from 'express';
import { requirePaid } from './session.cookie.js';
import { CareerRequest } from '../DTO/contest.requests.js';
import { listRoadmaps, getRoadmap } from '../Services/roadmap.service.js';

export const roadmapController = Router();

roadmapController.get('/roadmaps', requirePaid, async (_req, res) => {
  res.json(await listRoadmaps());
});

roadmapController.get('/roadmap', requirePaid, async (req, res) => {
  res.json(await getRoadmap(new CareerRequest(req.query)));
});
