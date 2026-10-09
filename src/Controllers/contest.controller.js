// The weekly contest for students (docs/openapi.yaml → Contest). All paid.
//   GET  /contest/state                 POST /contest/:id/attempt
//   PUT  /contest/:id/attempt/answers/:questionId
//   POST /contest/:id/attempt/submit    GET  /contest/:id/review
//   GET  /leaderboard
// GET /me/contest-history is in me.controller.js.
import { Router } from 'express';
import { requirePaid } from './session.cookie.js';
import { AnswerRequest, LeaderboardQuery, contestId } from '../DTO/contest.requests.js';
import * as contest from '../Services/contest.service.js';
import { leaderboard } from '../Services/leaderboard.service.js';

export const contestController = Router();

contestController.get('/contest/state', requirePaid, async (req, res) => {
  res.json(await contest.state(req.student));
});

contestController.post('/contest/:id/attempt', requirePaid, async (req, res) => {
  res.json(await contest.start(contestId(req.params.id), req.student.id));
});

contestController.put('/contest/:id/attempt/answers/:questionId', requirePaid, async (req, res) => {
  const id = contestId(req.params.id);
  await contest.saveAnswer(id, req.student.id, new AnswerRequest(id, req.params.questionId, req.body));
  res.json({ ok: true });
});

contestController.post('/contest/:id/attempt/submit', requirePaid, async (req, res) => {
  res.json(await contest.submit(contestId(req.params.id), req.student.id));
});

contestController.get('/contest/:id/review', requirePaid, async (req, res) => {
  res.json(await contest.review(contestId(req.params.id), req.student));
});

contestController.get('/leaderboard', requirePaid, async (req, res) => {
  res.json(await leaderboard(new LeaderboardQuery(req.query), req.student));
});
