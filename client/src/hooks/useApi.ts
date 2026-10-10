import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { api, errorMessage, type Paged } from '../lib/api';
import { useToast } from '../components/ui/Toast';

type Query = Record<string, string | number | boolean | undefined | null>;

export function useList<T>(resource: string, query: Query, opts: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: [resource, 'list', query],
    queryFn: () => api.get<Paged<T>>(`/${resource}`, query),
    placeholderData: keepPreviousData,
    enabled: opts.enabled,
  });
}

export function useDetail<T>(key: QueryKey, path: string, opts: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: key,
    queryFn: async () => (await api.get<{ data: T }>(path)).data,
    enabled: opts.enabled,
  });
}

export function useAction<TVars, TResult = unknown>(
  fn: (vars: TVars) => Promise<TResult>,
  opts: { success?: string | ((r: TResult) => string); invalidate?: string[]; onSuccess?: (r: TResult) => void; silentError?: boolean } = {},
) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: fn,
    onSuccess: async (r) => {
      for (const key of [...(opts.invalidate ?? []), 'dashboard', 'notifications']) await qc.invalidateQueries({ queryKey: [key] });
      if (opts.success) toast.success(typeof opts.success === 'function' ? opts.success(r) : opts.success);
      opts.onSuccess?.(r);
    },
    onError: (e) => {
      if (!opts.silentError) toast.error(errorMessage(e));
    },
  });
}

export interface Option {
  id: string;
  name: string;
}

export function useLookup<T extends Option = Option>(kind: 'users' | 'customers' | 'opportunities' | 'teams', query: Query = {}, enabled = true) {
  return useQuery({
    queryKey: ['lookups', kind, query],
    queryFn: async () => (await api.get<{ data: T[] }>(`/lookups/${kind}`, query)).data,
    staleTime: 60_000,
    enabled,
  });
}
