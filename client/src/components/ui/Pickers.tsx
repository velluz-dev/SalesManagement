import type { ComponentProps } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useLookup } from '../../hooks/useApi';
import { Select } from './Form';
import { translate } from '../../i18n';

type SelectProps = Omit<ComponentProps<typeof Select>, 'children'> & { placeholder?: string };

function LookupSelect({ kind, query, placeholder = 'Select…', ...rest }: SelectProps & { kind: 'users' | 'customers' | 'opportunities' | 'teams'; query?: Record<string, string | undefined> }) {
  const { data, isLoading } = useLookup(kind, query ?? {});
  return (
    <Select {...rest} disabled={rest.disabled || isLoading}>
      <option value="">{translate(isLoading ? 'Loading…' : placeholder)}</option>
      {data?.map((o) => (
        <option key={o.id} value={o.id}>{o.name}</option>
      ))}
    </Select>
  );
}

export const CustomerSelect = (p: SelectProps) => <LookupSelect kind="customers" placeholder={translate("Select a customer…")} {...p} />;
export const UserSelect = (p: SelectProps) => <LookupSelect kind="users" placeholder="Select a user…" {...p} />;
export const TeamSelect = (p: SelectProps) => <LookupSelect kind="teams" placeholder={translate("Select a team…")} {...p} />;
export const OpportunitySelect = ({ customerId, ...p }: SelectProps & { customerId?: string }) => (
  <LookupSelect kind="opportunities" query={{ customerId: customerId || undefined }} placeholder="No linked opportunity" {...p} />
);

export const enumOptions = (values: readonly string[], label: (v: string) => string) => values.map((v) => ({ value: v, label: label(v) }));

/** Active payment terms (Net 30, COD, ...), labelled with their day count. */
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
