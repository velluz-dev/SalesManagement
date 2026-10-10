import { env } from './config/env';
import { createApp } from './app';
import { prisma } from './lib/prisma';
import { startOverdueScanner } from './jobs/overdue-scanner';

const app = createApp();
const server = app.listen(env.PORT, () => {
  console.log(`CRM API listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
});
const stopScanner = startOverdueScanner(env.OVERDUE_SCAN_MINUTES);

// Periodically purge expired sessions.
const sessionSweep = setInterval(() => {
  prisma.session.deleteMany({ where: { expiresAt: { lt: new Date() } } }).catch(() => undefined);
}, 60 * 60_000);

async function shutdown(signal: string) {
  console.log(`${signal} received, shutting down`);
  stopScanner();
  clearInterval(sessionSweep);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
