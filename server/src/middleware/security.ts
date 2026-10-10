import type { NextFunction, Request, Response } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { env } from '../config/env';
import { forbidden } from '../lib/errors';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF defence-in-depth on top of SameSite cookies: reject state-changing requests that a browser
 * marks as cross-site or that carry an Origin outside the allow-list.
 */
export function originCheck(req: Request, _res: Response, next: NextFunction) {
  if (SAFE_METHODS.has(req.method)) return next();
  const fetchSite = req.get('sec-fetch-site');
  if (fetchSite === 'cross-site') return next(forbidden('Cross-site request rejected'));
  const origin = req.get('origin');
  if (origin && !env.CORS_ORIGINS.includes(origin)) return next(forbidden('Origin not allowed'));
  next();
}

const rateLimitHandler = (_req: Request, res: Response) =>
  res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many requests. Please try again later.' } });

/** Brute-force protection for credentials endpoints: per IP + submitted email. */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  // ipKeyGenerator collapses IPv6 addresses to their /64 subnet so attackers cannot rotate addresses.
  keyGenerator: (req) => `${ipKeyGenerator(req.ip ?? '')}|${String(req.body?.email ?? '').toLowerCase().slice(0, 100)}`,
  skip: () => env.isTest && process.env.TEST_RATE_LIMIT !== 'true',
  handler: rateLimitHandler,
});

/** Throttle for sensitive authenticated actions (password change, role assignment). */
export const sensitiveLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: () => env.isTest,
  handler: rateLimitHandler,
});

/** General API throttle. */
export const apiLimiter = rateLimit({
  windowMs: 60_000,
  limit: 600,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: () => env.isTest,
  handler: rateLimitHandler,
});
