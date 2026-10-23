// A student's context for trusted server-side callers (docs/openapi.yaml → Service).
//   GET /userContext?email=
// No cookie: the caller sends Authorization: Bearer <USER_CONTEXT_TOKEN>.
// With USER_CONTEXT_TOKEN unset every call is refused.
import { Router } from 'express';
import { createHash, timingSafeEqual } from 'node:crypto';
import { ApiError } from '../DTO/ApiError.js';
import { UserContextRequest } from '../DTO/userContext.requests.js';
import { userContext } from '../Services/userContext.service.js';

export const userContextController = Router();

// Hashing first gives equal-length buffers, so the compare never leaks the length.
const digest = s => createHash('sha256').update(s).digest();

function requireServiceToken(req, _res, next) {
  const expected = process.env.USER_CONTEXT_TOKEN;
  const [scheme, token] = (req.headers.authorization || '').split(' ');
  if (!expected || scheme !== 'Bearer' || !token || !timingSafeEqual(digest(token), digest(expected))) {
    throw new ApiError(401, 'unauthenticated', 'A valid service token is required.');
  }
  next();
}

userContextController.get('/userContext', requireServiceToken, async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(await userContext(new UserContextRequest(req.query)));
});
