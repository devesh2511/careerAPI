// Student login and registration (docs/openapi.yaml → Auth).
//   POST /auth/register   POST /auth/login   POST /auth/logout
import { Router } from 'express';
import { RegisterRequest, LoginRequest } from '../DTO/auth.requests.js';
import * as authService from '../Services/auth.service.js';
import { setSessionCookie, clearSessionCookie, readSessionCookie } from './session.cookie.js';

export const authController = Router();

authController.post('/register', async (req, res) => {
  const { token, body } = await authService.register(new RegisterRequest(req.body), req.get('user-agent'));
  setSessionCookie(res, token);
  res.status(201).json(body);
});

authController.post('/login', async (req, res) => {
  const { token, body } = await authService.login(new LoginRequest(req.body), req.get('user-agent'));
  setSessionCookie(res, token);
  res.json(body);
});

authController.post('/logout', async (req, res) => {
  await authService.logout(readSessionCookie(req));
  clearSessionCookie(res);
  res.json({ ok: true });
});
