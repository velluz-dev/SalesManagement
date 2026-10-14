import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { loginLimiter, sensitiveLimiter } from '../../middleware/security';
import * as controller from './auth.controller';

export const authRouter = Router();

authRouter.post('/login', loginLimiter, controller.login);
authRouter.post('/logout', controller.logout);
authRouter.get('/me', authenticate, controller.me);
authRouter.post('/change-password', authenticate, sensitiveLimiter, controller.changePassword);
