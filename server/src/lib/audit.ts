import type { Db } from './prisma';

const REDACTED_KEYS = new Set(['passwordHash', 'password', 'tokenHash', 'currentPassword', 'newPassword']);

export function toAuditJson(value: unknown): unknown {
  if (value === undefined || value === null) return undefined;
  return JSON.parse(
    JSON.stringify(value, (key, v) => (REDACTED_KEYS.has(key) ? '[REDACTED]' : v)),
  );
}

export interface AuditEntry {
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
}

export async function audit(db: Db, actor: { user: { id: string }; ip?: string; userAgent?: string } | null, entry: AuditEntry) {
  await db.auditLog.create({
    data: {
      actorId: actor?.user.id ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      before: toAuditJson(entry.before) as never,
      after: toAuditJson(entry.after) as never,
      ip: actor?.ip ?? null,
      userAgent: actor?.userAgent ?? null,
    },
  });
}
