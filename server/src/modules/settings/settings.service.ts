import { z } from 'zod';
import { SETTING_DEFINITIONS, type SettingDefinition } from '../../shared';
import { prisma } from '../../lib/prisma';
import type { Actor } from '../../lib/auth-context';
import { audit } from '../../lib/audit';
import { badRequest } from '../../lib/errors';
import { getSettings } from '../../lib/settings';

export const updateSettingsSchema = z.record(z.string(), z.unknown());

function validatorFor(def: SettingDefinition): z.ZodType {
  switch (def.type) {
    case 'boolean':
      return z.boolean();
    case 'number':
      return z.number().min(def.min ?? -Infinity).max(def.max ?? Infinity);
    case 'enum':
      return z.enum(def.options as [string, ...string[]]);
    default:
      return z.string().trim().min(1).max(200);
  }
}

export async function getPublicSettings() {
  const s = await getSettings(prisma);
  return {
    'company.name': s['company.name'],
    'company.currency': s['company.currency'],
    'quotation.defaultTaxRate': s['quotation.defaultTaxRate'],
    'quotation.defaultValidityDays': s['quotation.defaultValidityDays'],
  };
}

export async function getAllSettings() {
  const values = await getSettings(prisma);
  return { definitions: SETTING_DEFINITIONS, values };
}

export async function updateSettings(actor: Actor, body: z.infer<typeof updateSettingsSchema>) {
  const defs = new Map<string, SettingDefinition>(SETTING_DEFINITIONS.map((d) => [d.key, d]));
  const updates: { key: string; value: unknown }[] = [];
  const errors: { path: string; message: string }[] = [];
  for (const [key, raw] of Object.entries(body)) {
    const def = defs.get(key);
    if (!def) {
      errors.push({ path: key, message: 'Unknown setting' });
      continue;
    }
    const r = validatorFor(def).safeParse(raw);
    if (!r.success) errors.push({ path: key, message: r.error.issues[0]?.message ?? 'Invalid value' });
    else updates.push({ key, value: r.data });
  }
  if (errors.length) throw badRequest('Invalid settings', errors);

  await prisma.$transaction(async (tx) => {
    const before = await getSettings(tx);
    for (const u of updates) {
      await tx.systemSetting.upsert({
        where: { key: u.key },
        create: { key: u.key, value: u.value as never, updatedById: actor.user.id },
        update: { value: u.value as never, updatedById: actor.user.id },
      });
    }
    await audit(tx, actor, {
      action: 'settings.updated',
      entityType: 'SystemSetting',
      before: Object.fromEntries(updates.map((u) => [u.key, before[u.key as keyof typeof before]])),
      after: Object.fromEntries(updates.map((u) => [u.key, u.value])),
    });
  });
  return { definitions: SETTING_DEFINITIONS, values: await getSettings(prisma) };
}
