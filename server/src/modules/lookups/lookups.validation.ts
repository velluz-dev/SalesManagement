import { z } from 'zod';
import { uuid } from '../../lib/validation';

export const searchQuery = z.object({ q: z.string().trim().max(100).optional(), customerId: uuid.optional() });
