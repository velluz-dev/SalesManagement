import type { ComponentProps } from 'react';
import { useLookup } from '../../hooks/useApi';
import { Select } from './Form';

type SelectProps = Omit<ComponentProps<typeof Select>, 'children'> & { placeholder?: string };

function LookupSelect({ kind, query, placeholder = 'Select…', ...rest }: SelectProps & { kind: 'users' | 'customers' | 'opportunities' | 'teams'; query?: Record<string, string | undefined> }) {
  const { data, isLoading } = useLookup(kind, query ?? {});
  return (
    <Select {...rest} disabled={rest.disabled || isLoading}>
      <option value="">{isLoading ? 'Loading…' : placeholder}</option>
      {data?.map((o) => (
        <option key={o.id} value={o.id}>{o.name}</option>
      ))}
    </Select>
  );
}

export const CustomerSelect = (p: SelectProps) => <LookupSelect kind="customers" placeholder="Select a customer…" {...p} />;
export const UserSelect = (p: SelectProps) => <LookupSelect kind="users" placeholder="Select a user…" {...p} />;
export const TeamSelect = (p: SelectProps) => <LookupSelect kind="teams" placeholder="Select a team…" {...p} />;
export const OpportunitySelect = ({ customerId, ...p }: SelectProps & { customerId?: string }) => (
  <LookupSelect kind="opportunities" query={{ customerId: customerId || undefined }} placeholder="No linked opportunity" {...p} />
);

export const enumOptions = (values: readonly string[], label: (v: string) => string) => values.map((v) => ({ value: v, label: label(v) }));
