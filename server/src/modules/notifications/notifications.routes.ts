import { Router } from 'express';
import * as controller from './notifications.controller';

export const notificationsRouter = Router();

notificationsRouter.get('/', controller.listNotifications);
notificationsRouter.get('/unread-count', controller.unreadCount);
notificationsRouter.post('/:id/read', controller.markRead);
notificationsRouter.post('/read-all', controller.markAllRead);
