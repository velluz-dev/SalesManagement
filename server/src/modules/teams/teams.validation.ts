import { z } from 'zod';
import { requiredText, uuid } from '../../lib/validation';

export const teamSchema = z.strictObject({
  name: requiredText(80, 'Team name'),
  managerId: uuid.nullable().optional(),
  memberIds: z.array(uuid).max(200).optional(),
});
export const updateTeamSchema = teamSchema.partial();
