import type { Request, Response } from 'express';
import * as svc from './audit.service';
import { auditQuery } from './audit.validation';

export async function listAuditLogs(req: Request, res: Response) {
  res.json(await svc.listAuditLogs(auditQuery.parse(req.query)));
}

export async function auditFacets(_req: Request, res: Response) {
  res.json({ data: await svc.auditFacets() });
}
