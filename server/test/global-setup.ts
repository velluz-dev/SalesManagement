import { execSync } from 'node:child_process';
import { loadEnv } from 'vite';

/** Applies migrations to the dedicated test database before the suite runs. */
export default function setup() {
  const env = loadEnv('test', process.cwd(), '');
  if (!env.DATABASE_URL?.includes('_test')) {
    throw new Error(`Refusing to run tests against a non-test database: ${env.DATABASE_URL}`);
  }
  execSync('npx prisma migrate deploy', { stdio: 'inherit', env: { ...process.env, ...env } });
}
