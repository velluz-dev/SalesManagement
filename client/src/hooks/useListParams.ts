import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Table state (page, pageSize, q, sort, order + arbitrary filters) stored in the URL so lists are
 * shareable/bookmarkable and survive refresh. Changing any filter resets to page 1.
 */
export function useListParams<F extends string = never>(defaults: { sort?: string; order?: 'asc' | 'desc'; pageSize?: number } & Partial<Record<F, string>> = {}) {
  const [params, setParams] = useSearchParams();

  const state = useMemo(() => {
    const get = (k: string, d?: string) => params.get(k) ?? d ?? '';
    const filters = {} as Record<F, string>;
    for (const [k, v] of Object.entries(defaults)) {
      if (!['sort', 'order', 'pageSize'].includes(k)) (filters as Record<string, string>)[k] = get(k, v as string);
    }
    params.forEach((v, k) => {
      if (!['page', 'pageSize', 'q', 'sort', 'order'].includes(k)) (filters as Record<string, string>)[k] = v;
    });
    return {
      page: Number(get('page', '1')) || 1,
      pageSize: Number(get('pageSize', String(defaults.pageSize ?? 20))) || 20,
      q: get('q'),
      sort: get('sort', defaults.sort),
      order: (get('order', defaults.order ?? 'desc') as 'asc' | 'desc'),
      filters,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const update = useCallback(
    (patch: Record<string, string | number | undefined>, resetPage = true) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(patch)) {
            if (v === undefined || v === '') next.delete(k);
            else next.set(k, String(v));
          }
          if (resetPage && !('page' in patch)) next.delete('page');
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const query = useMemo(
    () => ({ page: state.page, pageSize: state.pageSize, q: state.q || undefined, sort: state.sort || undefined, order: state.order, ...state.filters }),
    [state],
  );

  return {
    ...state,
    query,
    setPage: (page: number) => update({ page }, false),
    setPageSize: (pageSize: number) => update({ pageSize }),
    setQ: (q: string) => update({ q }),
    setSort: (s: { sort?: string; order?: 'asc' | 'desc' }) => update({ sort: s.sort, order: s.order }),
    setFilter: (key: F, value: string) => update({ [key]: value }),
  };
}
