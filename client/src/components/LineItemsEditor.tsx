import { useFieldArray, type Control, type FieldErrors, type UseFormRegister, type UseFormSetValue, useWatch } from 'react-hook-form';
import { useQuery } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from './ui/Button';
import { Input, NumberInput, Select } from './ui/Form';
import { documentTotals, lineTotals } from '../lib/totals';
import { money } from '../lib/format';
import { api, type Paged } from '../lib/api';
import { useAuth } from '../auth/AuthProvider';
import type { Product } from '../lib/types';
import { translate } from '../i18n';

export interface LineItemValues {
  productId: string;
  description: string;
  quantity: string;
  unitPrice: string;
  discountPercent: string;
  taxRate: string;
}

export interface WithItems {
  items: LineItemValues[];
}

export const emptyLine = (taxRate = '0'): LineItemValues => ({ productId: '', description: '', quantity: '1', unitPrice: '', discountPercent: '0', taxRate });

function useSellableProducts() {
  const { canAny } = useAuth();
  return useQuery({
    queryKey: ['products', 'picker'],
    queryFn: async () => (await api.get<Paged<Product>>('/products', { pageSize: 100, sort: 'name', order: 'asc' })).data,
    enabled: canAny('product.read', 'product.manage'),
    staleTime: 5 * 60_000,
  });
}

export function LineItemsEditor({ control, register, errors, currency, defaultTaxRate = '0', setValue }: {
  control: Control<WithItems>;
  register: UseFormRegister<WithItems>;
  errors?: FieldErrors<WithItems>;
  currency?: string;
  defaultTaxRate?: string;
  setValue?: UseFormSetValue<WithItems>;
}) {
  const { fields, append, remove } = useFieldArray({ control, name: 'items' });
  const products = useSellableProducts();
  const showProducts = !!setValue && !!products.data?.length;
  const pickProduct = (i: number, id: string) => {
    setValue?.(`items.${i}.productId`, id);
    const p = products.data?.find((x) => x.id === id);
    if (p) {
      setValue?.(`items.${i}.description`, p.name, { shouldValidate: false });
      setValue?.(`items.${i}.unitPrice`, String(Number(p.listPrice)), { shouldValidate: false });
    }
  };
  const items = useWatch({ control, name: 'items' }) ?? [];
  const totals = documentTotals(items);
  const err = (i: number, k: keyof LineItemValues) => errors?.items?.[i]?.[k]?.message;

  return (
    <div>
      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="text-left text-xs font-medium text-slate-500">
              <th className="py-2 pr-2">{translate("Description")}</th>
              <th className="w-24 px-2 py-2">{translate("Qty")}</th>
              <th className="w-32 px-2 py-2">{translate("Unit price")}</th>
              <th className="w-24 px-2 py-2">{translate("Disc. %")}</th>
              <th className="w-24 px-2 py-2">{translate("Tax %")}</th>
              <th className="w-32 px-2 py-2 text-right">{translate("Line total")}</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {fields.map((f, i) => {
              const line = lineTotals(items[i] ?? f);
              return (
                <tr key={f.id} className="align-top">
                  <td className="py-1.5 pr-2">
                    {showProducts && (
                      <Select
                        aria-label={`Line ${i + 1} product`}
                        className="mb-1.5"
                        value={items[i]?.productId ?? ''}
                        onChange={(e) => pickProduct(i, e.target.value)}
                      >
                        <option value="">{translate("Custom item (no product)")}</option>
                        {products.data?.map((p) => (
                          <option key={p.id} value={p.id}>{p.code} · {p.name} ({money(p.listPrice, { currency })}/{p.unit})</option>
                        ))}
                      </Select>
                    )}
                    <Input aria-label={`Line ${i + 1} description`} invalid={!!err(i, 'description')} {...register(`items.${i}.description`)} />
                    {err(i, 'description') && <p className="mt-1 text-xs text-rose-600">{err(i, 'description')}</p>}
                  </td>
                  <td className="px-2 py-1.5"><NumberInput aria-label={`Line ${i + 1} quantity`} decimals={2} maxIntegerDigits={10} invalid={!!err(i, 'quantity')} {...register(`items.${i}.quantity`)} /></td>
                  <td className="px-2 py-1.5"><NumberInput aria-label={`Line ${i + 1} unit price`} decimals={2} invalid={!!err(i, 'unitPrice')} {...register(`items.${i}.unitPrice`)} /></td>
                  <td className="px-2 py-1.5"><NumberInput aria-label={`Line ${i + 1} discount percent`} decimals={2} maxValue={100} invalid={!!err(i, 'discountPercent')} {...register(`items.${i}.discountPercent`)} /></td>
                  <td className="px-2 py-1.5"><NumberInput aria-label={`Line ${i + 1} tax rate`} decimals={2} maxValue={100} invalid={!!err(i, 'taxRate')} {...register(`items.${i}.taxRate`)} /></td>
                  <td className="tabular px-2 py-3.5 text-right font-medium">{money(line.total / 100, { currency })}</td>
                  <td className="py-1.5 pl-1">
                    <button
                      type="button"
                      onClick={() => remove(i)}
                      disabled={fields.length === 1}
                      className="mt-2 rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30"
                      aria-label={`Remove line ${i + 1}`}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {typeof errors?.items?.message === 'string' && <p className="mt-2 text-xs text-rose-600">{errors.items.message}</p>}
      <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <Button variant="secondary" size="sm" icon={Plus} onClick={() => append(emptyLine(defaultTaxRate))} disabled={fields.length >= 100}>{translate("Add line")}</Button>
        <dl className="tabular w-full max-w-xs space-y-1.5 text-sm">
          <div className="flex justify-between text-slate-600"><dt>{translate("Subtotal")}</dt><dd>{money(totals.subtotal, { currency })}</dd></div>
          <div className="flex justify-between text-slate-600"><dt>{translate("Discount")}</dt><dd>−{money(totals.discountTotal, { currency })}</dd></div>
          <div className="flex justify-between text-slate-600"><dt>{translate("Tax")}</dt><dd>{money(totals.taxTotal, { currency })}</dd></div>
          <div className="flex justify-between border-t border-slate-200 pt-1.5 text-base font-semibold text-slate-900"><dt>{translate("Total")}</dt><dd>{money(totals.total, { currency })}</dd></div>
        </dl>
      </div>
    </div>
  );
}

export function validateItems(items: LineItemValues[]): Record<string, string> {
  const errors: Record<string, string> = {};
  const money = /^\d{1,12}(\.\d{1,2})?$/;
  const pct = (v: string) => v !== '' && !Number.isNaN(Number(v)) && Number(v) >= 0 && Number(v) <= 100;
  if (!items.length) errors['items'] = 'Add at least one line item';
  items.forEach((l, i) => {
    if (!l.description.trim()) errors[`items.${i}.description`] = 'Description is required';
    if (!/^\d{1,10}(\.\d{1,2})?$/.test(l.quantity) || Number(l.quantity) <= 0) errors[`items.${i}.quantity`] = 'Invalid quantity';
    if (!money.test(l.unitPrice)) errors[`items.${i}.unitPrice`] = 'Invalid price';
    if (!pct(l.discountPercent)) errors[`items.${i}.discountPercent`] = 'Use 0 to 100';
    if (!pct(l.taxRate)) errors[`items.${i}.taxRate`] = 'Use 0 to 100';
  });
  return errors;
}

export const itemsPayload = (items: LineItemValues[]) =>
  items.map((l) => ({
    productId: l.productId || null,
    description: l.description.trim(),
    quantity: l.quantity,
    unitPrice: l.unitPrice,
    discountPercent: Number(l.discountPercent),
    taxRate: Number(l.taxRate),
  }));
