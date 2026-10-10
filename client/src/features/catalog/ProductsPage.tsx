import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useQuery } from '@tanstack/react-query';
import { Package, Pencil, Plus } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { useAction, useList } from '../../hooks/useApi';
import { useListParams } from '../../hooks/useListParams';
import { Button } from '../../components/ui/Button';
import { DataTable, Pagination, type Column } from '../../components/ui/DataTable';
import { FilterSelect, PageHeader, SearchInput, Toolbar } from '../../components/ui/Layout';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { Checkbox, Field, FormError, Input, Textarea } from '../../components/ui/Form';
import { EmptyState } from '../../components/ui/EmptyState';
import { api, errorMessage } from '../../lib/api';
import { EMPTY, money } from '../../lib/format';
import type { Product } from '../../lib/types';

interface ProductValues {
  code: string;
  name: string;
  unit: string;
  category: string;
  listPrice: string;
  description: string;
  isActive: boolean;
}

function ProductForm({ product, onClose }: { product?: Product; onClose: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<ProductValues>({
    defaultValues: {
      code: product?.code ?? '',
      name: product?.name ?? '',
      unit: product?.unit ?? 'unit',
      category: product?.category ?? '',
      listPrice: product ? String(Number(product.listPrice)) : '',
      description: product?.description ?? '',
      isActive: product?.isActive ?? true,
    },
  });
  const save = useAction((body: unknown) => (product ? api.patch(`/products/${product.id}`, body) : api.post('/products', body)), {
    invalidate: ['products'],
    success: product ? 'Product updated' : 'Product added',
    silentError: true,
  });
  const onSubmit = async (v: ProductValues) => {
    setError(null);
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{1,39}$/.test(v.code.trim())) return setError('Code: 2–40 letters, numbers, dots, dashes or underscores');
    if (!v.name.trim()) return setError('Name is required');
    if (!/^\d{1,12}(\.\d{1,2})?$/.test(v.listPrice)) return setError('Enter a valid list price');
    try {
      await save.mutateAsync({
        code: v.code.trim(),
        name: v.name.trim(),
        unit: v.unit.trim() || 'unit',
        category: v.category.trim() || null,
        listPrice: v.listPrice,
        description: v.description.trim() || null,
        isActive: v.isActive,
      });
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={product ? `Edit ${product.code}` : 'New product'}
      description={product ? 'Price changes apply to new quotations and orders only; existing documents keep their prices.' : undefined}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit(onSubmit)} loading={formState.isSubmitting}>{product ? 'Save' : 'Add product'}</Button>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
        <div className="sm:col-span-2"><FormError message={error} /></div>
        <Field label="Code" required hint="Shown on quotations, e.g. CBL-CAT6"><Input className="uppercase" {...register('code')} /></Field>
        <Field label="Name" required><Input {...register('name')} /></Field>
        <Field label="List price" required><Input inputMode="decimal" {...register('listPrice')} /></Field>
        <Field label="Unit" hint="e.g. unit, box, day, license"><Input {...register('unit')} /></Field>
        <Field label="Category" className="sm:col-span-2"><Input {...register('category')} /></Field>
        <Field label="Description" className="sm:col-span-2"><Textarea {...register('description')} /></Field>
        <Checkbox className="sm:col-span-2" label="Available for sale" {...register('isActive')} />
      </form>
    </Modal>
  );
}

export default function ProductsPage() {
  const { can } = useAuth();
  const canManage = can('product.manage');
  const [editing, setEditing] = useState<Product | 'new' | null>(null);
  const lp = useListParams<'category' | 'isActive'>({ sort: 'name', order: 'asc' });
  const { data, isLoading, isFetching, error, refetch } = useList<Product>('products', lp.query);
  const categories = useQuery({
    queryKey: ['products', 'categories'],
    queryFn: async () => (await api.get<{ data: string[] }>('/products/categories')).data,
  });

  const columns: Column<Product>[] = [
    {
      key: 'name',
      header: 'Product',
      sortKey: 'name',
      cell: (p) => (
        <div>
          <p className="font-medium text-slate-900">{p.name}</p>
          <p className="font-mono text-xs text-slate-500">{p.code}</p>
        </div>
      ),
    },
    { key: 'category', header: 'Category', cell: (p) => p.category ?? EMPTY, hideOnMobile: true },
    { key: 'unit', header: 'Unit', cell: (p) => p.unit, hideOnMobile: true },
    { key: 'price', header: 'List price', sortKey: 'listPrice', align: 'right', cell: (p) => <span className="tabular font-medium">{money(p.listPrice)}</span> },
    ...(canManage ? [{ key: 'status', header: 'Status', cell: (p: Product) => (p.isActive ? <Badge tone="green">Available</Badge> : <Badge>Discontinued</Badge>) }] : []),
    ...(canManage
      ? [{
          key: 'edit',
          header: <span className="sr-only">Edit</span>,
          align: 'right' as const,
          cell: (p: Product) => (
            <button onClick={() => setEditing(p)} className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label={`Edit ${p.name}`}>
              <Pencil className="size-4" />
            </button>
          ),
        }]
      : []),
  ];

  return (
    <div>
      <PageHeader
        title="Products"
        description="The catalog used on quotations and sales orders."
        actions={canManage && <Button icon={Plus} onClick={() => setEditing('new')}>New product</Button>}
      />
      <div className="card overflow-hidden">
        <Toolbar>
          <SearchInput value={lp.q} onChange={lp.setQ} placeholder="Search code, name, category…" className="sm:w-80" />
          <FilterSelect label="Category" value={lp.filters.category ?? ''} onChange={(v) => lp.setFilter('category', v)} options={(categories.data ?? []).map((c) => ({ value: c, label: c }))} />
          {canManage && (
            <FilterSelect label="Status" value={lp.filters.isActive ?? ''} onChange={(v) => lp.setFilter('isActive', v)} options={[{ value: 'true', label: 'Available' }, { value: 'false', label: 'Discontinued' }]} />
          )}
        </Toolbar>
        <DataTable
          caption="Products"
          columns={columns}
          rows={data?.data}
          loading={isLoading || isFetching}
          error={error}
          onRetry={refetch}
          sort={lp}
          onSort={lp.setSort}
          empty={<EmptyState icon={Package} title="No products found" description={canManage ? 'Add your first product to start quoting from the catalog.' : undefined} />}
        />
        <Pagination meta={data?.meta} onPage={lp.setPage} onPageSize={lp.setPageSize} />
      </div>
      {editing && <ProductForm product={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
