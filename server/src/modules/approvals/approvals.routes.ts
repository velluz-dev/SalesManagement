import { Router } from 'express';
import { requireAnyPermission, requirePermission } from '../../middleware/auth';
import * as controller from './approvals.controller';

export const approvalsRouter = Router();

approvalsRouter.get('/', requireAnyPermission('approval.read.assigned', 'approval.read.all'), controller.listApprovals);
approvalsRouter.get('/:id', controller.getApproval);
approvalsRouter.post('/:id/decision', requirePermission('approval.decide'), controller.decide);

export const approvalRulesRouter = Router();

approvalRulesRouter.get('/', requireAnyPermission('settings.read', 'approval.read.all'), controller.listApprovalRules);
approvalRulesRouter.post('/', requirePermission('settings.manage'), controller.createApprovalRule);
approvalRulesRouter.put('/:id', requirePermission('settings.manage'), controller.updateApprovalRule);
approvalRulesRouter.delete('/:id', requirePermission('settings.manage'), controller.deleteApprovalRule);
