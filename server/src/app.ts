import express, { Router } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env } from './config/env';
import { authenticate } from './middleware/auth';
import { apiLimiter, originCheck } from './middleware/security';
import { errorHandler, notFoundHandler } from './middleware/error-handler';
import { authRouter } from './modules/auth/auth.routes';
import { usersRouter } from './modules/users/users.routes';
import { rolesRouter } from './modules/roles/roles.routes';
import { teamsRouter } from './modules/teams/teams.routes';
import { customersRouter } from './modules/customers/customers.routes';
import { leadsRouter } from './modules/leads/leads.routes';
import { opportunitiesRouter } from './modules/opportunities/opportunities.routes';
import { activitiesRouter } from './modules/activities/activities.routes';
import { quotationsRouter } from './modules/quotations/quotations.routes';
import { approvalRulesRouter, approvalsRouter } from './modules/approvals/approvals.routes';
import { targetsRouter } from './modules/targets/targets.routes';
import { invoicesRouter } from './modules/invoices/invoices.routes';
import { paymentsRouter } from './modules/payments/payments.routes';
import { creditRouter } from './modules/credit/credit.routes';
import { reportsRouter } from './modules/reports/reports.routes';
import { dashboardRouter } from './modules/dashboard/dashboard.routes';
import { notificationsRouter } from './modules/notifications/notifications.routes';
import { auditRouter } from './modules/audit/audit.routes';
import { settingsRouter } from './modules/settings/settings.routes';
import { lookupsRouter } from './modules/lookups/lookups.routes';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', env.isProd ? 1 : false);

  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGINS, credentials: true }));
  app.use(express.json({ limit: '200kb' }));
  app.use(cookieParser());
  app.use(originCheck);

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  const api = Router();
  api.use(apiLimiter);
  api.use('/auth', authRouter);

  const secured = Router();
  secured.use(authenticate);
  secured.use('/users', usersRouter);
  secured.use('/roles', rolesRouter);
  secured.use('/teams', teamsRouter);
  secured.use('/customers', customersRouter);
  secured.use('/leads', leadsRouter);
  secured.use('/opportunities', opportunitiesRouter);
  secured.use('/activities', activitiesRouter);
  secured.use('/quotations', quotationsRouter);
  secured.use('/approvals', approvalsRouter);
  secured.use('/approval-rules', approvalRulesRouter);
  secured.use('/targets', targetsRouter);
  secured.use('/invoices', invoicesRouter);
  secured.use('/payments', paymentsRouter);
  secured.use('/credit', creditRouter);
  secured.use('/reports', reportsRouter);
  secured.use('/dashboard', dashboardRouter);
  secured.use('/notifications', notificationsRouter);
  secured.use('/audit-logs', auditRouter);
  secured.use('/settings', settingsRouter);
  secured.use('/lookups', lookupsRouter);
  api.use(secured);

  app.use('/api', api);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
