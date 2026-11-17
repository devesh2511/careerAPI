// Student registration and login (docs/openapi.yaml → Auth).
//   POST /auth/register/check   POST /auth/register   POST /auth/register/link
//   POST /auth/login   POST /auth/logout
//   POST /auth/forgot-password   POST /auth/reset-password
import { Router } from 'express';
import {
  ListEntryRequest, RegisterRequest, LinkRequest, LoginRequest, ForgotPasswordRequest, ResetPasswordRequest,
} from '../DTO/auth.requests.js';
import * as authService from '../Services/auth.service.js';
import * as studentPassword from '../Services/student.password.service.js';
import { setSessionCookie, clearSessionCookie, readSessionCookie } from './session.cookie.js';

export const authController = Router();

// Step 1: name + phone + institute ID. Says whether to register or link.
authController.post('/register/check', async (req, res) => {
  res.json(await authService.checkEntry(new ListEntryRequest(req.body)));
});

authController.post('/register', async (req, res) => {
  const { token, body } = await authService.register(new RegisterRequest(req.body), req.get('user-agent'));
  setSessionCookie(res, token);
  res.status(201).json(body);
});

// An institute added to an existing account, with that account's password.
authController.post('/register/link', async (req, res) => {
  const { token, body } = await authService.link(new LinkRequest(req.body), req.get('user-agent'));
  setSessionCookie(res, token);
  res.json(body);
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

authController.post('/forgot-password', async (req, res) => {
  res.json(await studentPassword.requestReset(new ForgotPasswordRequest(req.body)));
});

authController.post('/reset-password', async (req, res) => {
  await studentPassword.resetPassword(new ResetPasswordRequest(req.body));
  clearSessionCookie(res);
  res.json({ ok: true });
});
