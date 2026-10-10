import { PrismaClient, Prisma, type OpportunityStage, type QuotationStatus } from '@prisma/client';
import { hash } from '@node-rs/argon2';
import { seedBase } from './seed-base';
import { calculateTotals } from '../src/lib/money';

const prisma = new PrismaClient();
export const DEMO_PASSWORD = 'Password123!';

if (process.env.NODE_ENV === 'production' && !process.argv.includes('--force-demo')) {
  console.error('Refusing to seed demo data in production.');
  process.exit(1);
}

let seed = 42;
const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const pick = <T,>(arr: readonly T[]) => arr[Math.floor(rand() * arr.length)]!;
const between = (min: number, max: number) => Math.round(min + rand() * (max - min));

const DAY = 86_400_000;
const today = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z');
const daysAgo = (n: number) => new Date(today.getTime() - n * DAY);
const daysAhead = (n: number) => new Date(today.getTime() + n * DAY);

async function wipe() {
  await prisma.$transaction([
    prisma.notification.deleteMany(),
    prisma.auditLog.deleteMany(),
    prisma.payment.deleteMany(),
    prisma.invoiceItem.deleteMany(),
    prisma.invoice.deleteMany(),
    prisma.salesOrderItem.deleteMany(),
    prisma.salesOrder.deleteMany(),
    prisma.contract.deleteMany(),
    prisma.approvalHistory.deleteMany(),
    prisma.approvalRequest.deleteMany(),
    prisma.quotationItem.deleteMany(),
    prisma.product.deleteMany(),
    prisma.quotation.updateMany({ data: { parentId: null } }),
    prisma.quotation.deleteMany(),
    prisma.activity.deleteMany(),
    prisma.opportunity.deleteMany(),
    prisma.lead.deleteMany(),
    prisma.customerCredit.deleteMany(),
    prisma.customer.deleteMany(),
    prisma.salesTarget.deleteMany(),
    prisma.session.deleteMany(),
    prisma.userRole.deleteMany(),
    prisma.team.updateMany({ data: { managerId: null } }),
    prisma.user.updateMany({ data: { teamId: null } }),
    prisma.team.deleteMany(),
    prisma.user.deleteMany(),
    prisma.approvalRule.deleteMany(),
  ]);
}

async function main() {
  console.log('Seeding DEMO data (fictional, for development only)…');
  await wipe();
  const roles = await seedBase(prisma, { resetRolePermissions: true });
  await prisma.systemSetting.upsert({ where: { key: 'system.demoData' }, create: { key: 'system.demoData', value: true }, update: { value: true } });
  await prisma.systemSetting.update({ where: { key: 'company.name' }, data: { value: 'Acme Trading Co. (Demo)' } });
  await prisma.systemSetting.update({ where: { key: 'company.currency' }, data: { value: 'MMK' } });

  const passwordHash = await hash(DEMO_PASSWORD, { memoryCost: 19_456, timeCost: 2, parallelism: 1 });
  const mkUser = (email: string, name: string, roleIds: string[]) =>
    prisma.user.create({ data: { email, username: email.split('@')[0]!, name, passwordHash, roles: { create: roleIds.map((roleId) => ({ roleId })) } } });

  const admin = await mkUser('admin@crm.local', 'Alex Admin', [roles.SYSTEM_ADMIN]);
  const director = await mkUser('director@crm.local', 'Dana Director', [roles.DIRECTOR]);
  const finance = await mkUser('finance@crm.local', 'Fiona Finance', [roles.FINANCE_OFFICER]);
  const manager = await mkUser('manager@crm.local', 'Morgan Manager', [roles.SALES_MANAGER]);
  const manager2 = await mkUser('manager2@crm.local', 'Riley Reyes', [roles.SALES_MANAGER]);
  const sales = await Promise.all([
    mkUser('sales@crm.local', 'Sam Seller', [roles.SALESPERSON]),
    mkUser('sales2@crm.local', 'Jordan Lee', [roles.SALESPERSON]),
    mkUser('sales3@crm.local', 'Casey Kim', [roles.SALESPERSON]),
    mkUser('sales4@crm.local', 'Taylor Nguyen', [roles.SALESPERSON]),
  ]);
  await mkUser('inactive@crm.local', 'Ivy Inactive', [roles.SALESPERSON]).then((u) =>
    prisma.user.update({ where: { id: u.id }, data: { isActive: false } }),
  );

  const enterprise = await prisma.team.create({ data: { name: 'Enterprise Sales', managerId: manager.id } });
  const smb = await prisma.team.create({ data: { name: 'SMB Sales', managerId: manager2.id } });
  await prisma.user.updateMany({ where: { id: { in: [sales[0]!.id, sales[1]!.id, manager.id] } }, data: { teamId: enterprise.id } });
  await prisma.user.updateMany({ where: { id: { in: [sales[2]!.id, sales[3]!.id, manager2.id] } }, data: { teamId: smb.id } });
  const sellers = [...sales, manager];

  const companies = [
    ['Northwind Logistics', 'Logistics'], ['Bluebird Retail', 'Retail'], ['Summit Healthcare', 'Healthcare'],
    ['Orion Manufacturing', 'Manufacturing'], ['Pioneer Foods', 'Food & Beverage'], ['Vertex Software', 'Technology'],
    ['Harbor Hotels', 'Hospitality'], ['Atlas Construction', 'Construction'], ['Evergreen Energy', 'Energy'],
    ['Silverline Telecom', 'Telecom'], ['Crescent Pharma', 'Healthcare'], ['Maple Education Group', 'Education'],
    ['Granite Financial', 'Finance'], ['Lighthouse Media', 'Media'], ['Redwood Agritech', 'Agriculture'],
    ['Cobalt Mining', 'Mining'],
  ] as const;
  const terms = await prisma.paymentTerm.findMany({ where: { isActive: true }, orderBy: { days: 'asc' } });
  const termByName = new Map(terms.map((t) => [t.name, t.id]));
  const customerTypes = ['CORPORATE', 'DEALER', 'RETAILER', 'CORPORATE'] as const;
  const customers = [];
  for (const [i, [name, industry]] of companies.entries()) {
    const owner = sellers[i % sellers.length]!;
    const slug = name.toLowerCase().replace(/[^a-z]+/g, '');
    const c = await prisma.customer.create({
      data: {
        name, industry, ownerId: owner.id,
        email: `accounts@${slug}.example.com`,
        phone: `+1 555 01${String(i).padStart(2, '0')}`,
        address: `${between(10, 999)} Demo Street, Sample City`,
        taxId: `DEMO-${1000 + i}`,
        type: customerTypes[i % customerTypes.length],
        paymentTermId: i % 4 === 3 ? null : termByName.get(pick(['Net 15', 'Net 30', 'Net 30', 'Net 45', 'Net 60'])) ?? null,
      },
    });
    customers.push(c);
    if (i % 4 !== 3) {
      await prisma.customerCredit.create({
        data: {
          customerId: c.id,
          creditLimit: pick([50_000_000, 100_000_000, 150_000_000, 200_000_000, 300_000_000]),
          onHold: i === 9,
          notes: i === 9 ? 'On hold pending overdue settlement (demo)' : null,
          updatedById: finance.id,
        },
      });
    }
  }

  const leadTitles = ['Fleet tracking rollout', 'POS upgrade', 'Warehouse automation', 'Annual support renewal', 'Cloud migration', 'Office fit-out', 'Training program', 'Security audit', 'Data platform', 'Field service app'];
  const leadStatuses = ['NEW', 'NEW', 'CONTACTED', 'CONTACTED', 'QUALIFIED', 'UNQUALIFIED'] as const;
  const people = ['Chris Morgan', 'Pat Rivera', 'Jamie Chen', 'Robin Patel', 'Avery Brooks', 'Quinn Foster', 'Drew Santos', 'Sky Walker', 'Reese Adams', 'Logan Price'];
  for (let i = 0; i < 26; i++) {
    const owner = sellers[i % sellers.length]!;
    await prisma.lead.create({
      data: {
        title: `${pick(leadTitles)}, ${pick(['Q', 'Phase ', 'Wave '])}${between(1, 4)}`,
        contactName: pick(people),
        company: `${pick(['Apex', 'Nova', 'Zenith', 'Prime', 'Bright', 'Core'])} ${pick(['Systems', 'Group', 'Partners', 'Holdings', 'Labs'])}`,
        email: `contact${i}@lead.example.com`,
        phone: `+1 555 02${String(i).padStart(2, '0')}`,
        source: pick(['WEBSITE', 'REFERRAL', 'EVENT', 'COLD_CALL', 'PARTNER'] as const),
        status: pick(leadStatuses),
        estimatedValue: between(10, 250) * 1_000_000,
        ownerId: owner.id,
        createdAt: daysAgo(between(1, 120)),
      },
    });
  }

  const stages: OpportunityStage[] = ['PROSPECTING', 'QUALIFICATION', 'PROPOSAL', 'NEGOTIATION', 'CLOSED_WON', 'CLOSED_WON', 'CLOSED_LOST'];
  const probability: Record<OpportunityStage, number> = { PROSPECTING: 10, QUALIFICATION: 25, PROPOSAL: 50, NEGOTIATION: 75, CLOSED_WON: 100, CLOSED_LOST: 0 };
  const opportunities = [];
  for (let i = 0; i < 40; i++) {
    const customer = customers[i % customers.length]!;
    const stage = i < 6 ? 'CLOSED_WON' : pick(stages);
    const closed = stage === 'CLOSED_WON' || stage === 'CLOSED_LOST';
    const closedAt = closed ? daysAgo(i < 6 ? between(0, 8) : between(5, 175)) : null;
    opportunities.push(
      await prisma.opportunity.create({
        data: {
          name: `${pick(leadTitles)} for ${customer.name}`,
          customerId: customer.id,
          ownerId: customer.ownerId,
          stage,
          amount: between(15, 300) * 1_000_000,
          probability: probability[stage],
          expectedCloseDate: closed ? closedAt : daysAhead(between(5, 120)),
          closedAt,
          createdAt: closedAt ? new Date(closedAt.getTime() - between(20, 60) * DAY) : daysAgo(between(1, 60)),
        },
      }),
    );
  }

  for (let i = 0; i < 30; i++) {
    const opp = opportunities[i % opportunities.length]!;
    const done = rand() > 0.5;
    await prisma.activity.create({
      data: {
        type: pick(['CALL', 'MEETING', 'EMAIL', 'TASK'] as const),
        subject: pick(['Discovery call', 'Send proposal', 'Pricing review', 'Follow-up', 'Demo session', 'Contract walkthrough']),
        ownerId: opp.ownerId,
        opportunityId: opp.id,
        customerId: opp.customerId,
        dueAt: done ? daysAgo(between(1, 30)) : rand() > 0.3 ? daysAhead(between(0, 14)) : daysAgo(between(1, 5)),
        completedAt: done ? daysAgo(between(0, 20)) : null,
      },
    });
  }

  const catalog = [
    ['SRV-IMPL', 'Implementation services', 'day', 'Services', 2_500_000],
    ['LIC-ANNUAL', 'Annual software license', 'license', 'Software', 38_000_000],
    ['HW-BUNDLE', 'Hardware bundle', 'set', 'Hardware', 9_500_000],
    ['SUP-PREM', 'Premium support plan', 'year', 'Support', 12_500_000],
    ['TRN-WS', 'Training workshop', 'session', 'Services', 5_000_000],
    ['INT-PKG', 'Integration package', 'package', 'Software', 20_000_000],
    ['CBL-CAT6', 'Cat6 network cable (305 m)', 'box', 'Hardware', 380_000],
    ['SW-24P', '24-port managed switch', 'unit', 'Hardware', 2_000_000],
    ['UPS-3K', '3 kVA online UPS', 'unit', 'Hardware', 3_500_000],
    ['LEGACY-SCAN', 'Barcode scanner (discontinued)', 'unit', 'Hardware', 500_000],
  ] as const;
  const products = [];
  for (const [code, name, unit, category, price] of catalog) {
    products.push(
      await prisma.product.create({
        data: { code, name, unit, category, listPrice: price, isActive: code !== 'LEGACY-SCAN', description: `${name} (demo catalog)` },
      }),
    );
  }
  const sellable = products.filter((p) => p.isActive);
  let qSeq = 1;
  let invSeq = 1;
  const year = today.getUTCFullYear();

  type Flow = { status: QuotationStatus; approver?: 'manager' | 'director'; rejected?: boolean };
  const flows: Flow[] = [
    { status: 'DRAFT' }, { status: 'DRAFT' }, { status: 'PENDING_APPROVAL' }, { status: 'PENDING_APPROVAL' },
    { status: 'PENDING_APPROVAL' }, { status: 'APPROVED' }, { status: 'SENT' }, { status: 'REJECTED', rejected: true },
    { status: 'ACCEPTED' }, { status: 'ACCEPTED' }, { status: 'ACCEPTED' }, { status: 'ACCEPTED' }, { status: 'ACCEPTED' },
    { status: 'ACCEPTED' }, { status: 'DECLINED' }, { status: 'PENDING_APPROVAL' },
  ];

  const accepted: { id: string; customerId: string; ownerId: string; items: Prisma.QuotationItemCreateManyQuotationInput[]; total: Prisma.Decimal }[] = [];

  for (const [i, flow] of flows.entries()) {
    const owner = sellers[i % sales.length]!;
    const ownerCustomers = customers.filter((c) => c.ownerId === owner.id);
    const customer = ownerCustomers[i % Math.max(1, ownerCustomers.length)] ?? customers[0]!;
    const opp = opportunities.find((o) => o.customerId === customer.id);
    const n = between(1, 4);
    const big = i % 5 === 4;
    const items = Array.from({ length: n }, (_, idx) => {
      const product = pick(sellable.slice(0, 6));
      return {
        position: idx + 1,
        productId: product.id,
        description: product.name,
        quantity: new Prisma.Decimal(big ? between(3, 8) : between(1, 3)),
        unitPrice: product.listPrice,
        discountPercent: new Prisma.Decimal(pick([0, 0, 5, 10])),
        taxRate: new Prisma.Decimal(pick([0, 7])),
      };
    });
    const totals = calculateTotals(items);
    const created = daysAgo(between(3, 90));
    const ownerUser = await prisma.user.findUniqueOrThrow({ where: { id: owner.id }, include: { team: true } });
    const approverIsDirector = totals.total.gte(100_000_000);
    const approverId = approverIsDirector ? director.id : (ownerUser.team?.managerId ?? director.id);

    const q = await prisma.quotation.create({
      data: {
        number: `Q-${year}-${String(qSeq++).padStart(5, '0')}`,
        customerId: customer.id,
        opportunityId: opp?.id,
        ownerId: owner.id,
        status: flow.status,
        issueDate: created,
        validUntil: new Date(Math.max(created.getTime() + 30 * DAY, daysAhead(10).getTime())),
        currency: 'MMK',
        notes: 'Sample quotation (demo data)',
        terms: 'Payment due within customer terms. Prices exclude delivery.',
        ...totals,
        submittedAt: flow.status === 'DRAFT' ? null : new Date(created.getTime() + DAY),
        approvedAt: ['APPROVED', 'SENT', 'ACCEPTED', 'DECLINED'].includes(flow.status) ? new Date(created.getTime() + 2 * DAY) : null,
        sentAt: ['SENT', 'ACCEPTED', 'DECLINED'].includes(flow.status) ? new Date(created.getTime() + 3 * DAY) : null,
        createdAt: created,
        items: { createMany: { data: items } },
      },
    });

    if (flow.status !== 'DRAFT') {
      const decided = flow.status !== 'PENDING_APPROVAL';
      const approved = decided && !flow.rejected;
      await prisma.approvalRequest.create({
        data: {
          quotationId: q.id,
          quotationVersion: 1,
          amount: totals.total,
          requestedById: owner.id,
          approverRoleId: approverIsDirector ? roles.DIRECTOR : roles.SALES_MANAGER,
          assignedToId: approverIsDirector ? null : approverId,
          status: !decided ? 'PENDING' : approved ? 'APPROVED' : 'REJECTED',
          decidedById: decided ? approverId : null,
          decidedAt: decided ? new Date(created.getTime() + 2 * DAY) : null,
          decisionComment: flow.rejected ? 'Discount exceeds policy for this customer segment. Please revise.' : decided ? 'Looks good.' : null,
          createdAt: new Date(created.getTime() + DAY),
          history: {
            create: [
              { action: 'SUBMITTED', actorId: owner.id, createdAt: new Date(created.getTime() + DAY) },
              ...(decided
                ? [{
                    action: approved ? ('APPROVED' as const) : ('REJECTED' as const),
                    actorId: approverId,
                    comment: flow.rejected ? 'Discount exceeds policy for this customer segment. Please revise.' : 'Looks good.',
                    createdAt: new Date(created.getTime() + 2 * DAY),
                  }]
                : []),
            ],
          },
        },
      });
    }
    if (flow.status === 'ACCEPTED') accepted.push({ id: q.id, customerId: customer.id, ownerId: owner.id, items, total: totals.total });
  }

  let cSeq = 1;
  let oSeq = 1;
  const lineCopy = (items: typeof accepted[number]['items']) =>
    items.map(({ position, productId, description, quantity, unitPrice, discountPercent, taxRate }) => ({ position, productId, description, quantity, unitPrice, discountPercent, taxRate }));
  for (const [i, q] of accepted.slice(0, 2).entries()) {
    const start = daysAgo(between(20, 40));
    const contract = await prisma.contract.create({
      data: {
        number: `C-${year}-${String(cSeq++).padStart(5, '0')}`,
        quotationId: q.id,
        customerId: q.customerId,
        ownerId: q.ownerId,
        title: i === 0 ? 'Annual supply agreement (demo)' : 'Rollout services contract (demo)',
        startDate: start,
        endDate: new Date(start.getTime() + 365 * DAY),
        value: q.total,
        currency: 'MMK',
        terms: 'Deliveries scheduled per sales order. Payment per customer terms.',
        createdById: q.ownerId,
        createdAt: start,
      },
    });
    const totals = calculateTotals(q.items as never);
    const delivered = i === 0;
    const order = await prisma.salesOrder.create({
      data: {
        number: `SO-${year}-${String(oSeq++).padStart(5, '0')}`,
        customerId: q.customerId,
        ownerId: q.ownerId,
        contractId: contract.id,
        quotationId: q.id,
        status: delivered ? 'DELIVERED' : 'PENDING',
        orderDate: new Date(start.getTime() + 2 * DAY),
        deliveryDate: delivered ? new Date(start.getTime() + 9 * DAY) : daysAhead(7),
        currency: 'MMK',
        ...totals,
        confirmedAt: delivered ? new Date(start.getTime() + 3 * DAY) : null,
        deliveredAt: delivered ? new Date(start.getTime() + 9 * DAY) : null,
        createdById: q.ownerId,
        items: { createMany: { data: lineCopy(q.items) } },
      },
    });
    if (delivered) {
      const issueDate = new Date(start.getTime() + 10 * DAY);
      const inv = await prisma.invoice.create({
        data: {
          number: `INV-${year}-${String(invSeq++).padStart(5, '0')}`,
          customerId: q.customerId,
          salesOrderId: order.id,
          salespersonId: q.ownerId,
          status: 'PAID',
          issueDate,
          dueDate: new Date(issueDate.getTime() + 30 * DAY),
          currency: 'MMK',
          ...totals,
          amountPaid: totals.total,
          createdById: finance.id,
          createdAt: issueDate,
          items: { createMany: { data: lineCopy(q.items) } },
        },
      });
      await prisma.payment.create({
        data: { invoiceId: inv.id, amount: totals.total, method: 'KPAY', reference: `KPAY-${between(100000, 999999)}`, paidAt: new Date(Math.min(issueDate.getTime() + 12 * DAY, today.getTime())), recordedById: finance.id },
      });
    }
  }

  // A manual order for a dealer, waiting for confirmation.
  const dealer = customers.find((c) => c.type === 'DEALER') ?? customers[1]!;
  const dealerLines = [
    { position: 1, productId: products[6]!.id, description: products[6]!.name, quantity: new Prisma.Decimal(40), unitPrice: products[6]!.listPrice, discountPercent: new Prisma.Decimal(5), taxRate: new Prisma.Decimal(0) },
    { position: 2, productId: products[7]!.id, description: products[7]!.name, quantity: new Prisma.Decimal(6), unitPrice: products[7]!.listPrice, discountPercent: new Prisma.Decimal(0), taxRate: new Prisma.Decimal(0) },
  ];
  await prisma.salesOrder.create({
    data: {
      number: `SO-${year}-${String(oSeq++).padStart(5, '0')}`,
      customerId: dealer.id,
      ownerId: dealer.ownerId,
      status: 'CONFIRMED',
      orderDate: daysAgo(2),
      deliveryDate: daysAhead(5),
      currency: 'MMK',
      ...calculateTotals(dealerLines),
      confirmedAt: daysAgo(1),
      notes: 'Restock order (demo)',
      createdById: dealer.ownerId,
      items: { createMany: { data: dealerLines } },
    },
  });

  const invoicePlans = ['OVERDUE', 'PARTIAL', 'OVERDUE_PARTIAL', 'DRAFT', 'PAID', 'PAID'] as const;
  for (const [i, q] of accepted.slice(2).entries()) {
    const plan = invoicePlans[i % invoicePlans.length]!;
    const isDraft = plan === 'DRAFT';
    const issueDate = plan.startsWith('OVERDUE') ? daysAgo(between(50, 80)) : daysAgo(between(5, 25));
    const dueDate = new Date(issueDate.getTime() + 30 * DAY);
    const totals = calculateTotals(q.items as never);
    const paid =
      plan === 'PAID' ? totals.total : plan === 'PARTIAL' || plan === 'OVERDUE_PARTIAL' ? totals.total.mul(0.4).toDecimalPlaces(2) : new Prisma.Decimal(0);
    const inv = await prisma.invoice.create({
      data: {
        number: `INV-${year}-${String(invSeq++).padStart(5, '0')}`,
        customerId: q.customerId,
        quotationId: q.id,
        salespersonId: q.ownerId,
        status: isDraft ? 'DRAFT' : plan === 'PAID' ? 'PAID' : paid.gt(0) ? 'PARTIALLY_PAID' : 'ISSUED',
        issueDate: isDraft ? null : issueDate,
        dueDate: isDraft ? null : dueDate,
        currency: 'MMK',
        ...totals,
        amountPaid: paid,
        createdById: finance.id,
        createdAt: issueDate,
        items: { createMany: { data: lineCopy(q.items) } },
      },
    });
    if (paid.gt(0)) {
      await prisma.payment.create({
        data: {
          invoiceId: inv.id,
          amount: paid,
          method: pick(['BANK_TRANSFER', 'BANK_TRANSFER', 'CHEQUE', 'CARD'] as const),
          reference: `DEMO-TX-${between(10000, 99999)}`,
          paidAt: new Date(Math.min(issueDate.getTime() + between(5, 20) * DAY, today.getTime())),
          recordedById: finance.id,
        },
      });
    }
  }

  for (let m = 1; m <= 5; m++) {
    const customer = customers[m]!;
    const items = [{ position: 1, description: 'Monthly managed service (demo)', quantity: new Prisma.Decimal(1), unitPrice: new Prisma.Decimal(between(12, 40) * 1_000_000), discountPercent: new Prisma.Decimal(0), taxRate: new Prisma.Decimal(0) }];
    const totals = calculateTotals(items);
    const issueDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - m, 5));
    const inv = await prisma.invoice.create({
      data: {
        number: `INV-${year}-${String(invSeq++).padStart(5, '0')}`,
        customerId: customer.id,
        salespersonId: customer.ownerId,
        status: 'PAID',
        issueDate,
        dueDate: new Date(issueDate.getTime() + 30 * DAY),
        ...totals,
        amountPaid: totals.total,
        createdById: finance.id,
        createdAt: issueDate,
        items: { createMany: { data: items } },
      },
    });
    await prisma.payment.create({
      data: { invoiceId: inv.id, amount: totals.total, method: 'BANK_TRANSFER', reference: `DEMO-TX-${between(10000, 99999)}`, paidAt: new Date(issueDate.getTime() + 20 * DAY), recordedById: finance.id },
    });
  }

  await prisma.$executeRawUnsafe(`SELECT setval('quotation_number_seq', ${qSeq + 1000})`);
  await prisma.$executeRawUnsafe(`SELECT setval('invoice_number_seq', ${invSeq + 1000})`);
  await prisma.$executeRawUnsafe(`SELECT setval('contract_number_seq', ${cSeq + 1000})`);
  await prisma.$executeRawUnsafe(`SELECT setval('sales_order_number_seq', ${oSeq + 1000})`);

  const mStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const mEnd = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0));
  const qIdx = Math.floor(today.getUTCMonth() / 3);
  const qStart = new Date(Date.UTC(today.getUTCFullYear(), qIdx * 3, 1));
  const qEnd = new Date(Date.UTC(today.getUTCFullYear(), qIdx * 3 + 3, 0));
  for (const s of sales) {
    const team = [sales[0]!.id, sales[1]!.id].includes(s.id) ? manager : manager2;
    await prisma.salesTarget.create({
      data: { userId: s.id, periodType: 'MONTH', periodStart: mStart, periodEnd: mEnd, amount: pick([120_000_000, 160_000_000, 200_000_000]), setById: team.id },
    });
  }
  await prisma.salesTarget.create({ data: { teamId: enterprise.id, periodType: 'QUARTER', periodStart: qStart, periodEnd: qEnd, amount: 1_200_000_000, setById: director.id } });
  await prisma.salesTarget.create({ data: { teamId: smb.id, periodType: 'QUARTER', periodStart: qStart, periodEnd: qEnd, amount: 800_000_000, setById: director.id } });

  await prisma.auditLog.create({ data: { actorId: admin.id, action: 'system.seeded', entityType: 'System', after: { demo: true } } });

  console.log('\nDemo accounts (password for all: %s)', DEMO_PASSWORD);
  console.table([
    { role: 'System Administrator', username: 'admin', email: 'admin@crm.local' },
    { role: 'Approver / Director', username: 'director', email: 'director@crm.local' },
    { role: 'Finance Officer', username: 'finance', email: 'finance@crm.local' },
    { role: 'Sales Manager (Enterprise)', username: 'manager', email: 'manager@crm.local' },
    { role: 'Sales Manager (SMB)', username: 'manager2', email: 'manager2@crm.local' },
    { role: 'Salesperson (Enterprise)', username: 'sales', email: 'sales@crm.local' },
    { role: 'Salesperson', username: 'sales2 / sales3 / sales4', email: 'sales2@crm.local / sales3@crm.local / sales4@crm.local' },
  ]);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
