// The admin session cookie and the requireAdmin middleware. A separate
// cookie from the student one, so a student session can never act as an
// admin. Path=/ like the student cookie: the frontend reaches the API
// through its /api proxy, so a Path=/admin cookie would never be sent back.
import { ApiError } from '../DTO/ApiError.js';
import { resolveAdminSession, LIFETIME_HOURS } from '../Services/admin.auth.service.js';
import { cookieOptions, readCookie } from './session.cookie.js';

export const ADMIN_COOKIE = 'careerai_admin_session';

const adminCookieOptions = () => cookieOptions(LIFETIME_HOURS * 3600e3);
export function setAdminCookie(res, token) { res.cookie(ADMIN_COOKIE, token, adminCookieOptions()); }
export function clearAdminCookie(res) { res.clearCookie(ADMIN_COOKIE, { ...adminCookieOptions(), maxAge: undefined }); }
export const readAdminCookie = req => readCookie(req, ADMIN_COOKIE);

// Sets req.admin ({ id, email, full_name }) or answers 401.
export async function requireAdmin(req, _res, next) {
  const admin = await resolveAdminSession(readAdminCookie(req));
  if (!admin) throw new ApiError(401, 'unauthenticated', 'Please log in as an admin.');
  req.admin = admin;
  next();
}
