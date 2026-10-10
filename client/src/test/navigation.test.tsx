import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DEFAULT_ROLE_PERMISSIONS } from '@shared';
import { NAVIGATION } from '../components/layout/navigation';
import { StatusBadge, InvoiceStatusBadge } from '../components/ui/Badge';

const visibleFor = (perms: string[]) =>
  NAVIGATION.flatMap((s) => s.items).filter((i) => !i.any.length || i.any.some((p) => perms.includes(p))).map((i) => i.label);

describe('permission-driven navigation', () => {
  it('shows salespeople only sales menus', () => {
    const items = visibleFor(DEFAULT_ROLE_PERMISSIONS.SALESPERSON.permissions);
    expect(items).toEqual(expect.arrayContaining(['Dashboard', 'Leads', 'Quotations', 'Targets']));
    expect(items).not.toEqual(expect.arrayContaining(['Invoices']));
    expect(items).not.toContain('Users');
    expect(items).not.toContain('Approvals');
  });
  it('shows finance the finance menus but not leads', () => {
    const items = visibleFor(DEFAULT_ROLE_PERMISSIONS.FINANCE_OFFICER.permissions);
    expect(items).toEqual(expect.arrayContaining(['Invoices', 'Overdue', 'Payments', 'Customer credit']));
    expect(items).not.toContain('Leads');
  });
  it('shows administrators admin menus and no business data', () => {
    const items = visibleFor(DEFAULT_ROLE_PERMISSIONS.SYSTEM_ADMIN.permissions);
    expect(items).toEqual(expect.arrayContaining(['Users', 'Roles & permissions', 'Audit log', 'Settings']));
    for (const l of ['Customers', 'Quotations', 'Invoices', 'Approvals']) expect(items).not.toContain(l);
  });
});

describe('status badges', () => {
  it('labels statuses and gives overdue precedence', () => {
    render(<><StatusBadge status="PENDING_APPROVAL" /><InvoiceStatusBadge status="ISSUED" isOverdue /></>);
    expect(screen.getByText('Pending approval')).toBeInTheDocument();
    expect(screen.getByText('Overdue')).toBeInTheDocument();
  });
});
