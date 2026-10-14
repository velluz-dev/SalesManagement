import type { Request, Response } from 'express';
import { getActor } from '../../lib/auth-context';
import * as svc from './reports.service';

export async function salesReport(req: Request, res: Response) {
  res.json({ data: await svc.salesReport(getActor(req), svc.rangeQuery.parse(req.query)) });
}

export async function financeReport(req: Request, res: Response) {
  res.json({ data: await svc.financeReport(svc.rangeQuery.parse(req.query)) });
}
