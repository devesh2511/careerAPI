// My Career Space (docs/openapi.yaml → Career Space). Paid.
//   GET /career-news?career=
// The career is a query parameter, not a path segment: titles like
// "UI/UX Designer" contain a slash.
import { Router } from 'express';
import { requirePaid } from './session.cookie.js';
import { CareerRequest } from '../DTO/contest.requests.js';
import { getCareerNews } from '../Services/news.service.js';

export const newsController = Router();

newsController.get('/career-news', requirePaid, async (req, res) => {
  // The server-side cache does the real work; this just stops a tab
  // refetching on every switch between careers.
  res.set('Cache-Control', 'private, max-age=600');
  res.json(await getCareerNews(new CareerRequest(req.query)));
});
