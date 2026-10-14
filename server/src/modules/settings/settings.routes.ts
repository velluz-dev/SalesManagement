import { Router } from 'express';
import { requirePermission } from '../../middleware/auth';
import * as controller from './settings.controller';

export const settingsRouter = Router();

settingsRouter.get('/public', controller.getPublicSettings);
settingsRouter.get('/', requirePermission('settings.read'), controller.getSettings);
settingsRouter.put('/', requirePermission('settings.manage'), controller.updateSettings);
