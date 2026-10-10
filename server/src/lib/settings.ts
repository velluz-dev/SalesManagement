import { SETTING_DEFINITIONS, type SettingKey } from '@crm/shared';
import type { Db } from './prisma';

type Defs = (typeof SETTING_DEFINITIONS)[number];
type ValueOf<K extends SettingKey> = Extract<Defs, { key: K }>['default'] extends boolean
  ? boolean
  : Extract<Defs, { key: K }>['default'] extends number
    ? number
    : string;

export type SettingsMap = { [K in SettingKey]: ValueOf<K> };

export function defaultSettings(): SettingsMap {
  return Object.fromEntries(SETTING_DEFINITIONS.map((d) => [d.key, d.default])) as SettingsMap;
}

/** All settings, with catalogue defaults filling any key that is not stored. */
export async function getSettings(db: Db): Promise<SettingsMap> {
  const rows = await db.systemSetting.findMany();
  const map = defaultSettings() as Record<string, unknown>;
  for (const r of rows) if (r.key in map) map[r.key] = r.value;
  return map as SettingsMap;
}

export async function getSetting<K extends SettingKey>(db: Db, key: K): Promise<SettingsMap[K]> {
  const row = await db.systemSetting.findUnique({ where: { key } });
  if (row) return row.value as SettingsMap[K];
  return defaultSettings()[key];
}
