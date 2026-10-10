import { prisma } from '../lib/prisma';
import { notify, usersWithPermission } from '../lib/notify';
import { overdueWhere } from '../modules/invoices/invoices.service';

export async function scanOverdueInvoices() {
  const overdue = await prisma.invoice.findMany({
    where: overdueWhere(),
    select: { id: true, number: true, total: true, amountPaid: true, dueDate: true, currency: true, salespersonId: true, customer: { select: { name: true } } },
  });
  if (!overdue.length) return 0;
  const finance = await usersWithPermission(prisma, 'payment.create');
  for (const inv of overdue) {
    const recipients = [...finance, ...(inv.salespersonId ? [inv.salespersonId] : [])];
    await notify(prisma, recipients, {
      type: 'INVOICE_OVERDUE',
      title: `Invoice ${inv.number} is overdue`,
      message: `${inv.customer.name} owes ${inv.currency} ${inv.total.sub(inv.amountPaid).toFixed(2)}, due ${inv.dueDate?.toISOString().slice(0, 10)}`,
      link: `/invoices/${inv.id}`,
      dedupeKey: `invoice-overdue:${inv.id}`,
    });
  }
  return overdue.length;
}

export function startOverdueScanner(intervalMinutes: number) {
  if (intervalMinutes <= 0) return () => undefined;
  const run = () => scanOverdueInvoices().catch((e) => console.error('Overdue scan failed', e));
  const initial = setTimeout(run, 5_000);
  const timer = setInterval(run, intervalMinutes * 60_000);
  return () => {
    clearTimeout(initial);
    clearInterval(timer);
  };
}
