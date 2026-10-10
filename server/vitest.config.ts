import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';

export default defineConfig({
  test: {
    // .env then .env.test (test database, NODE_ENV=test).
    env: loadEnv('test', process.cwd(), ''),
    globalSetup: ['./test/global-setup.ts'],
    include: ['test/**/*.test.ts'],
    // Integration tests share one database: run files sequentially.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
