import { prisma } from '../lib/prisma';
import { notify, usersWithPermission } from '../lib/notify';
import { getSetting } from '../lib/settings';
import { addDays, daysBetween, endOfDay, startOfTodayUtc } from '../lib/dates';
import { overdueWhere } from '../modules/invoices/invoices.service';
import { followUpWhere } from '../modules/leads/leads.service';

const OVERDUE_STEPS = [60, 30, 7, 1] as const;
const dayKey = (d: Date) => d.toISOString().slice(0, 10);

export async function scanOverdueInvoices() {
  const today = startOfTodayUtc();
  const overdue = await prisma.invoice.findMany({
    where: overdueWhere(),
    select: { id: true, number: true, total: true, amountPaid: true, dueDate: true, currency: true, salespersonId: true, customer: { select: { name: true } } },
  });
  if (!overdue.length) return 0;
  const finance = await usersWithPermission(prisma, 'payment.create');
  for (const inv of overdue) {
    const days = daysBetween(inv.dueDate!, today);
    const step = OVERDUE_STEPS.find((s) => days >= s) ?? 1;
    await notify(prisma, [...finance, ...(inv.salespersonId ? [inv.salespersonId] : [])], {
      type: 'INVOICE_OVERDUE',
      title: step === 1 ? `Invoice ${inv.number} is overdue` : `Invoice ${inv.number} is ${step}+ days overdue`,
      message: `${inv.customer.name} owes ${inv.currency} ${inv.total.sub(inv.amountPaid).toFixed(2)}, due ${dayKey(inv.dueDate!)}`,
      link: `/invoices/${inv.id}`,
      dedupeKey: step === 1 ? `invoice-overdue:${inv.id}` : `invoice-overdue:${inv.id}:${step}`,
    });
  }
  return overdue.length;
}

export async function scanInvoicesDueSoon() {
  const daysBefore = await getSetting(prisma, 'invoice.reminderDaysBefore');
  if (daysBefore <= 0) return 0;
  const today = startOfTodayUtc();
  const dueSoon = await prisma.invoice.findMany({
    where: { status: { in: ['ISSUED', 'PARTIALLY_PAID'] }, dueDate: { gte: today, lte: addDays(today, daysBefore) } },
    select: { id: true, number: true, total: true, amountPaid: true, dueDate: true, currency: true, salespersonId: true, customer: { select: { name: true } } },
  });
  if (!dueSoon.length) return 0;
  const finance = await usersWithPermission(prisma, 'payment.create');
  for (const inv of dueSoon) {
    await notify(prisma, [...finance, ...(inv.salespersonId ? [inv.salespersonId] : [])], {
      type: 'INVOICE_DUE_SOON',
      title: `Invoice ${inv.number} is due ${dayKey(inv.dueDate!)}`,
      message: `${inv.customer.name} has ${inv.currency} ${inv.total.sub(inv.amountPaid).toFixed(2)} to pay`,
      link: `/invoices/${inv.id}`,
      dedupeKey: `invoice-due:${inv.id}:${dayKey(inv.dueDate!)}`,
    });
  }
  return dueSoon.length;
}

export async function scanFollowUps(now: Date = new Date()) {
  const cutoff = endOfDay(startOfTodayUtc(now));
  const [activities, leads] = await Promise.all([
    prisma.activity.findMany({
      where: { completedAt: null, dueAt: { lte: cutoff } },
      select: { id: true, subject: true, dueAt: true, ownerId: true, leadId: true, opportunityId: true, customerId: true },
    }),
    prisma.lead.findMany({ where: followUpWhere('due', now), select: { id: true, title: true, contactName: true, nextFollowUpAt: true, ownerId: true } }),
  ]);
  for (const a of activities) {
    const overdue = a.dueAt! < now;
    const link = a.leadId ? `/leads/${a.leadId}` : a.opportunityId ? `/opportunities/${a.opportunityId}` : a.customerId ? `/customers/${a.customerId}` : '/activities';
    await notify(prisma, [a.ownerId], {
      type: 'FOLLOW_UP_DUE',
      title: overdue ? `Overdue: ${a.subject}` : `Due today: ${a.subject}`,
      message: `Follow-up scheduled for ${a.dueAt!.toISOString().slice(0, 16).replace('T', ' ')}`,
      link,
      dedupeKey: `activity-due:${a.id}:${a.dueAt!.toISOString()}`,
    });
  }
  for (const l of leads) {
    await notify(prisma, [l.ownerId], {
      type: 'FOLLOW_UP_DUE',
      title: `Follow up with ${l.contactName}`,
      message: `Lead "${l.title}" is due for a follow-up`,
      link: `/leads/${l.id}`,
      dedupeKey: `lead-follow-up:${l.id}:${l.nextFollowUpAt!.toISOString()}`,
    });
  }
  return activities.length + leads.length;
}

export async function expireQuotations() {
  const today = startOfTodayUtc();
  const stale = await prisma.quotation.findMany({
    where: { status: { in: ['APPROVED', 'SENT'] }, validUntil: { lt: today } },
    select: { id: true, number: true, version: true, ownerId: true, customer: { select: { name: true } } },
  });
  for (const q of stale) {
    const { count } = await prisma.quotation.updateMany({ where: { id: q.id, status: { in: ['APPROVED', 'SENT'] } }, data: { status: 'EXPIRED' } });
    if (!count) continue;
    await prisma.auditLog.create({ data: { action: 'quotation.expired', entityType: 'Quotation', entityId: q.id, after: { status: 'EXPIRED' } } });
    await notify(prisma, [q.ownerId], {
      type: 'QUOTATION_EXPIRED',
      title: `Quotation ${q.number} v${q.version} expired`,
      message: `The offer to ${q.customer.name} passed its validity date. Revise it to send a new offer.`,
      link: `/quotations/${q.id}`,
      dedupeKey: `quotation-expired:${q.id}`,
    });
  }
  return stale.length;
}

export async function runScheduledScans() {
  await expireQuotations();
  await scanOverdueInvoices();
  await scanInvoicesDueSoon();
  await scanFollowUps();
}

export function startOverdueScanner(intervalMinutes: number) {
  if (intervalMinutes <= 0) return () => undefined;
  const run = () => runScheduledScans().catch((e) => console.error('Scheduled scan failed', e));
  const initial = setTimeout(run, 5_000);
  const timer = setInterval(run, intervalMinutes * 60_000);
  return () => {
    clearTimeout(initial);
    clearInterval(timer);
  };
}
