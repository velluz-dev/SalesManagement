import { z } from 'zod';
import { paginationQuery } from '../../lib/pagination';
import { booleanQuery } from '../../lib/validation';

export const listNotificationsQuery = paginationQuery.extend({ unread: booleanQuery });
export const readAllSchema = z.object({});
