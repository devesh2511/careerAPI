// The session cookie and the requireStudent middleware: the HTTP side of
// sessions. The logic lives in Services/session.service.js.
import { ApiError } from '../DTO/ApiError.js';
import { resolveSession, LIFETIME_DAYS } from '../Services/session.service.js';

export const COOKIE = 'careerai_session';

function cookieOptions() {
  return {
    httpOnly: true,
    // Secure cookies need HTTPS; local dev runs on plain http.
    secure: process.env.NODE_ENV === 'production',
    // The frontend is served from another origin, so in production the cookie
    // must be sent on cross-site fetches (SameSite=None requires Secure).
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    path: '/',
    maxAge: LIFETIME_DAYS * 24 * 3600e3,
  };
}

export function setSessionCookie(res, token) { res.cookie(COOKIE, token, cookieOptions()); }
export function clearSessionCookie(res) { res.clearCookie(COOKIE, { ...cookieOptions(), maxAge: undefined }); }

// No cookie-parser dependency for one cookie.
export function readSessionCookie(req) {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === COOKIE) {
      try { return decodeURIComponent(part.slice(i + 1).trim()); } catch { return null; }
    }
  }
  return null;
}

// Sets req.student (a students row) or answers 401.
export async function requireStudent(req, res, next) {
  const token = readSessionCookie(req);
  const session = await resolveSession(token);
  if (!session) throw ApiError.unauthenticated();
  if (session.extended) setSessionCookie(res, token);
  req.student = session.student;
  next();
}
