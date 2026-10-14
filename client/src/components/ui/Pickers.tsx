import type { ComponentProps, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useLookup } from '../../hooks/useApi';
import { Select } from './Form';
import { translate } from '../../i18n';

type SelectProps = Omit<ComponentProps<typeof Select>, 'children'> & { placeholder?: string; empty?: ReactNode };

export function EmptyHint({ text, to, onClick, action }: { text: string; to?: string; onClick?: () => void; action?: string }) {
  const actionClass = 'font-medium text-brand-600 hover:text-brand-700 hover:underline';
  return (
    <>
      {translate(text)}
      {action && to && <> <Link to={to} className={actionClass}>{translate(action)}</Link></>}
      {action && onClick && <> <button type="button" onClick={onClick} className={actionClass}>{translate(action)}</button></>}
    </>
  );
}

function LookupSelect({ kind, query, placeholder = 'Select…', empty, ...rest }: SelectProps & { kind: 'users' | 'customers' | 'opportunities' | 'teams'; query?: Record<string, string | undefined> }) {
  const { data, isLoading } = useLookup(kind, query ?? {});
  return (
    <>
      <Select {...rest} disabled={rest.disabled || isLoading}>
        <option value="">{translate(isLoading ? 'Loading…' : placeholder)}</option>
        {data?.map((o) => (
          <option key={o.id} value={o.id}>{o.name}</option>
        ))}
      </Select>
      {empty && !rest.invalid && data?.length === 0 && <p className="mt-1.5 text-xs text-slate-500">{typeof empty === 'string' ? translate(empty) : empty}</p>}
    </>
  );
}

export const CustomerSelect = (p: SelectProps) => <LookupSelect kind="customers" placeholder={translate("Select a customer…")} empty="No customers yet." {...p} />;
export const UserSelect = (p: SelectProps) => <LookupSelect kind="users" placeholder="Select a user…" empty="No active users found." {...p} />;
export const TeamSelect = (p: SelectProps) => <LookupSelect kind="teams" placeholder={translate("Select a team…")} empty="No teams yet." {...p} />;
export const OpportunitySelect = ({ customerId, ...p }: SelectProps & { customerId?: string }) => (
  <LookupSelect kind="opportunities" query={{ customerId: customerId || undefined }} placeholder="No linked opportunity" {...p} />
);

export const enumOptions = (values: readonly string[], label: (v: string) => string) => values.map((v) => ({ value: v, label: label(v) }));

export function PaymentTermSelect({ placeholder = 'Default terms', ...rest }: SelectProps) {
  const { data, isLoading } = useQuery({
    queryKey: ['payment-terms'],
    queryFn: async () => (await api.get<{ data: { id: string; name: string; days: number }[] }>('/payment-terms')).data,
    staleTime: 5 * 60_000,
  });
  return (
    <Select {...rest} disabled={rest.disabled || isLoading}>
      <option value="">{translate(isLoading ? 'Loading…' : placeholder)}</option>
      {data?.map((t) => (
        <option key={t.id} value={t.id}>{t.name}{t.name.toLowerCase().includes(String(t.days)) || t.days === 0 ? '' : ` (${t.days} days)`}</option>
      ))}
    </Select>
  );
}
