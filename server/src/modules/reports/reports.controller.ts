import type { Request, Response } from 'express';
import { getActor } from '../../lib/auth-context';
import * as svc from './reports.service';
import { rangeQuery } from './reports.validation';

export async function salesReport(req: Request, res: Response) {
  res.json({ data: await svc.salesReport(getActor(req), rangeQuery.parse(req.query)) });
}

export async function financeReport(req: Request, res: Response) {
  res.json({ data: await svc.financeReport(rangeQuery.parse(req.query)) });
}
