import { Router } from 'express';
import { z } from 'zod';
import { SETTING_DEFINITIONS, type SettingDefinition } from '@crm/shared';
import { prisma } from '../../lib/prisma';
import { requirePermission } from '../../middleware/auth';
import { getActor } from '../../lib/auth-context';
import { audit } from '../../lib/audit';
import { badRequest } from '../../lib/errors';
import { getSettings } from '../../lib/settings';

export const settingsRouter = Router();

/** Public, non-sensitive settings every signed-in user needs (e.g. currency for formatting). */
settingsRouter.get('/public', async (_req, res) => {
  const s = await getSettings(prisma);
  // Set only by the development seed; drives the "demo data" banner in the UI.
  const demo = await prisma.systemSetting.findUnique({ where: { key: 'system.demoData' } });
  res.json({
    data: {
      'company.name': s['company.name'],
      'company.currency': s['company.currency'],
      'quotation.defaultTaxRate': s['quotation.defaultTaxRate'],
      'quotation.defaultValidityDays': s['quotation.defaultValidityDays'],
      demoData: demo?.value === true,
    },
  });
});

settingsRouter.get('/', requirePermission('settings.read'), async (_req, res) => {
  const values = await getSettings(prisma);
  res.json({ data: { definitions: SETTING_DEFINITIONS, values } });
});

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

settingsRouter.put('/', requirePermission('settings.manage'), async (req, res) => {
  const actor = getActor(req);
  const body = z.record(z.string(), z.unknown()).parse(req.body);
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
  res.json({ data: { definitions: SETTING_DEFINITIONS, values: await getSettings(prisma) } });
});
