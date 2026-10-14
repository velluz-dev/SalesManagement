import type { Request, Response } from 'express';
import { createSession, clearSessionCookie, SESSION_COOKIE } from '../../lib/session';
import { getActor } from '../../lib/auth-context';
import * as svc from './auth.service';

export async function login(req: Request, res: Response) {
  const user = await svc.verifyLogin(svc.loginSchema.parse(req.body));
  await createSession(res, user.id, { ip: req.ip, userAgent: req.get('user-agent')?.slice(0, 255) });
  await svc.recordLogin(user.id, { ip: req.ip, userAgent: req.get('user-agent') });
  res.json({ data: { ok: true } });
}

export async function logout(req: Request, res: Response) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (typeof token === 'string' && token) {
    await svc.deleteSession(token);
  }
  clearSessionCookie(res);
  res.status(204).end();
}

export async function me(req: Request, res: Response) {
  res.json({ data: await svc.getMe(req.auth!) });
}

export async function changePassword(req: Request, res: Response) {
  const actor = getActor(req);
  await svc.changePassword(actor, svc.changePasswordSchema.parse(req.body));
  res.json({ data: { ok: true } });
}
