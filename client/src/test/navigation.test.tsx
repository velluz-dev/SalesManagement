import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DEFAULT_ROLE_PERMISSIONS } from '@shared';
import { NAVIGATION, isNavActive } from '../components/layout/navigation';
import { StatusBadge, InvoiceStatusBadge } from '../components/ui/Badge';

const visibleFor = (perms: string[]) =>
  NAVIGATION.flatMap((s) => s.items).filter((i) => !i.any.length || i.any.some((p) => perms.includes(p))).map((i) => i.label);

describe('permission-driven navigation', () => {
  it('shows salespeople only sales menus', () => {
    const items = visibleFor(DEFAULT_ROLE_PERMISSIONS.SALESPERSON.permissions);
    expect(items).toEqual(expect.arrayContaining(['Dashboard', 'Leads', 'Quotations', 'Contracts', 'Sales Orders', 'Products', 'Sales Target', 'Sales Reports']));
    expect(items).not.toContain('Invoices');
    expect(items).not.toContain('Financial Reports');
    expect(items).not.toContain('Payment Terms');
    expect(items).not.toContain('Users');
    expect(items).not.toContain('Approvals');
  });
  it('shows finance the finance menus but not leads', () => {
    const items = visibleFor(DEFAULT_ROLE_PERMISSIONS.FINANCE_OFFICER.permissions);
    expect(items).toEqual(expect.arrayContaining(['Invoices', 'Payments', 'Customer Credit', 'Overdue', 'Payment Terms', 'Financial Reports', 'Sales Orders']));
    expect(items).not.toContain('Leads');
    expect(items).not.toContain('Sales Reports'); // finance has no sales-report permission
  });
  it('shows administrators admin menus and no business data', () => {
    const items = visibleFor(DEFAULT_ROLE_PERMISSIONS.SYSTEM_ADMIN.permissions);
    expect(items).toEqual(expect.arrayContaining(['Users', 'Roles & Permissions', 'Teams', 'Audit Log', 'System Settings']));
    for (const l of ['Customers', 'Quotations', 'Invoices', 'Approvals', 'Products', 'Sales Orders', 'Contracts']) expect(items).not.toContain(l);
  });
  it('highlights only the matching report link', () => {
    expect(isNavActive('/reports?tab=finance', '/reports', '?tab=finance')).toBe(true);
    expect(isNavActive('/reports?tab=sales', '/reports', '?tab=finance')).toBe(false);
    expect(isNavActive('/reports?tab=sales', '/reports', '')).toBe(true);
    expect(isNavActive('/quotations', '/quotations/123', '')).toBe(true);
    expect(isNavActive('/', '/quotations', '')).toBe(false);
  });
});

describe('status badges', () => {
  it('labels statuses and gives overdue precedence', () => {
    render(<><StatusBadge status="PENDING_APPROVAL" /><InvoiceStatusBadge status="ISSUED" isOverdue /></>);
    expect(screen.getByText('Pending approval')).toBeInTheDocument();
    expect(screen.getByText('Overdue')).toBeInTheDocument();
  });
});
