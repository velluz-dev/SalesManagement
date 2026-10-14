import { Router } from 'express';
import { requirePermission } from '../../middleware/auth';
import * as controller from './teams.controller';

export const teamsRouter = Router();

teamsRouter.get('/', requirePermission('team.read'), controller.listTeams);
teamsRouter.get('/:id', requirePermission('team.read'), controller.getTeam);
teamsRouter.post('/', requirePermission('team.manage'), controller.createTeam);
teamsRouter.patch('/:id', requirePermission('team.manage'), controller.updateTeam);
teamsRouter.delete('/:id', requirePermission('team.manage'), controller.deleteTeam);
