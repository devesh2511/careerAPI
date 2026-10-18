// The career catalogue (docs/openapi.yaml → Careers). Free: no login.
//   GET /careers
import { Router } from 'express';
import { listCareers } from '../Services/career.service.js';

export const careerController = Router();

careerController.get('/careers', async (_req, res) => {
  // Changes only with a migration; browsers may reuse it for a few minutes.
  res.set('Cache-Control', 'public, max-age=300');
  res.json(await listCareers());
});
