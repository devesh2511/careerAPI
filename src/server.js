// careerAPI entry point. Layout:
//   Controllers/ endpoints: routes, cookies, status codes
//   DTO/         classes: request validation, response shapes, ApiError
//   Services/    backend logic (no req/res)
//   Database/    every SQL query
import express from 'express';
import cors from 'cors';
import { pool } from './Database/db.js';
import { ApiError } from './DTO/ApiError.js';
import { systemController, connectSwagger } from './Controllers/system.controller.js';
import { authController } from './Controllers/auth.controller.js';
import { meController } from './Controllers/me.controller.js';
import { contestController } from './Controllers/contest.controller.js';
import { adminController } from './Controllers/admin.controller.js';

const app = express();
const PORT = process.env.PORT || 3000;
const origins = (process.env.CORS_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);

// credentials: the session is a cookie, so the frontend calls fetch(..., { credentials: 'include' }).
app.use(cors({ origin: origins.length ? origins : false, credentials: true }));
app.use(express.json({ limit: '100kb' }));

app.use(systemController);
app.use('/auth', authController);
app.use('/me', meController);
app.use(contestController);
app.use('/admin', adminController);
// Last of the routes: it checks which spec endpoints the controllers above provide.
connectSwagger(app);

app.use((_req, res) => {
  res.status(404).json(new ApiError(404, 'not_found', 'No such endpoint.'));
});

// Express 5 forwards rejected async handlers here.
app.use((err, _req, res, _next) => {
  if (err instanceof ApiError) return res.status(err.status).json(err);
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json(new ApiError(400, 'bad_json', 'The request body is not valid JSON.'));
  }
  console.error(err);
  res.status(500).json(new ApiError(500, 'server_error', 'Something went wrong. Please try again.'));
});

// On Vercel the exported app runs as a serverless function; locally it listens.
export default app;

if (!process.env.VERCEL) {
  const server = app.listen(PORT, () => {
    console.log(`career-api listening on http://localhost:${PORT}`);
  });

  const shutdown = () => server.close(() => pool.end().then(() => process.exit(0)));
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
