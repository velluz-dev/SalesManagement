import type { NextFunction, Request, RequestHandler, Response } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { env } from '../config/env';
import { forbidden } from '../lib/errors';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

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

const loginIdentifier = (req: Request) => String(req.body?.identifier ?? '').trim().toLowerCase().slice(0, 100);
const skipLoginLimits = () => env.isTest && process.env.TEST_RATE_LIMIT !== 'true';

const loginPairLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => `pair|${ipKeyGenerator(req.ip ?? '')}|${loginIdentifier(req)}`,
  skip: skipLoginLimits,
  handler: rateLimitHandler,
});

const loginIpLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => `ip|${ipKeyGenerator(req.ip ?? '')}`,
  skip: skipLoginLimits,
  handler: rateLimitHandler,
});

const loginAccountLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 25,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => `acct|${loginIdentifier(req)}`,
  skip: skipLoginLimits,
  handler: rateLimitHandler,
});

function chain(...handlers: RequestHandler[]): RequestHandler {
  return (req, res, next) => {
    const run = (i: number): void => {
      const handler = handlers[i];
      if (!handler) return next();
      handler(req, res, (err?: unknown) => (err ? next(err) : run(i + 1)));
    };
    run(0);
  };
}

export const loginLimiter = chain(loginIpLimiter, loginAccountLimiter, loginPairLimiter);

export const sensitiveLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: () => env.isTest,
  handler: rateLimitHandler,
});

export const apiLimiter = rateLimit({
  windowMs: 60_000,
  limit: 600,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: () => env.isTest,
  handler: rateLimitHandler,
});
