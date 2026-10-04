// Contest authoring (docs/openapi.yaml → Admin · Contests), at /admin/contests.
import { Router } from 'express';
import { CreateContestRequest, QuestionRequest, intId, listDeleted, deleteMode } from '../DTO/admin.requests.js';
import * as contests from '../Services/admin.contest.service.js';

export const adminContestsController = Router();
const contestId = req => intId(req.params.id, 'contest');

adminContestsController.get('/', async (req, res) => {
  res.json(await contests.list(listDeleted(req.query)));
});

adminContestsController.post('/', async (req, res) => {
  res.status(201).json(await contests.create(new CreateContestRequest(req.body), req.admin.id));
});

adminContestsController.get('/:id', async (req, res) => {
  res.json(await contests.detail(contestId(req)));
});

adminContestsController.delete('/:id', async (req, res) => {
  await contests.remove(contestId(req), deleteMode(req.query));
  res.json({ ok: true });
});

adminContestsController.post('/:id/restore', async (req, res) => {
  res.json(await contests.restore(contestId(req)));
});

adminContestsController.put('/:id/questions/:position', async (req, res) => {
  const id = contestId(req);
  res.json(await contests.saveQuestion(id, new QuestionRequest(req.params.position, req.body)));
});

adminContestsController.post('/:id/schedule', async (req, res) => {
  res.json(await contests.schedule(contestId(req)));
});

adminContestsController.post('/:id/unschedule', async (req, res) => {
  res.json(await contests.unschedule(contestId(req)));
});
