import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { app, resetDb } from '../helpers';

const attempt = (identifier: string) => request(app).post('/api/auth/login').send({ identifier, password: 'wrong-password-1' });

describe('login brute-force protection', () => {
  beforeAll(async () => {
    await resetDb();
    process.env.TEST_RATE_LIMIT = 'true';
  });
  afterAll(() => {
    delete process.env.TEST_RATE_LIMIT;
  });

  it('throttles repeated guesses against one account (10 per IP)', async () => {
    const codes = [];
    for (let i = 0; i < 11; i++) codes.push((await attempt('victim.account')).status);
    expect(codes.slice(0, 10).every((c) => c === 401)).toBe(true);
    expect(codes[10]).toBe(429);
  });

  it('throttles password spraying across many accounts from one IP (30 failures)', async () => {
    // The previous test already spent 11 attempts from this IP (blocked attempts count too).
    let allowed = 0;
    let status = 401;
    for (let i = 0; i < 40 && status !== 429; i++) {
      status = (await attempt(`spray.user${i}`)).status;
      if (status === 401) allowed++;
    }
    expect(status).toBe(429);
    expect(11 + allowed).toBe(30);
  });
});
