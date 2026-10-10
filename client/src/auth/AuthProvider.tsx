import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Permission } from '@crm/shared';
import { api, ApiError, setUnauthorizedHandler } from '../lib/api';
import { setCurrency } from '../lib/format';

export interface Me {
  user: {
    id: string;
    email: string;
    name: string;
    teamId: string | null;
    mustChangePassword: boolean;
    team: { id: string; name: string } | null;
  };
  roles: string[];
  permissions: Permission[];
  managedTeamIds: string[];
}

export interface PublicSettings {
  'company.name': string;
  'company.currency': string;
  'quotation.defaultTaxRate': number;
  'quotation.defaultValidityDays': number;
  demoData: boolean;
}

interface AuthState {
  me: Me | null;
  settings: PublicSettings | null;
  loading: boolean;
  can: (p: Permission) => boolean;
  canAny: (...p: Permission[]) => boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<unknown>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const meQuery = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        return (await api.get<{ data: Me }>('/auth/me')).data;
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
    staleTime: 5 * 60_000,
    retry: false,
  });
  const me = meQuery.data ?? null;

  const settingsQuery = useQuery({
    queryKey: ['settings', 'public'],
    queryFn: async () => (await api.get<{ data: PublicSettings }>('/settings/public')).data,
    enabled: !!me,
    staleTime: 10 * 60_000,
  });
  useEffect(() => {
    if (settingsQuery.data) setCurrency(settingsQuery.data['company.currency']);
  }, [settingsQuery.data]);

  // Any 401 from the API (expired/revoked session) resets auth state → login screen.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      qc.setQueryData(['me'], null);
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
    });
  }, [qc]);

  const perms = useMemo(() => new Set<string>(me?.permissions ?? []), [me]);
  const can = useCallback((p: Permission) => perms.has(p), [perms]);
  const canAny = useCallback((...p: Permission[]) => p.some((x) => perms.has(x)), [perms]);

  const login = useCallback(
    async (email: string, password: string) => {
      await api.post('/auth/login', { email, password });
      qc.clear();
      await qc.fetchQuery({ queryKey: ['me'], queryFn: async () => (await api.get<{ data: Me }>('/auth/me')).data });
    },
    [qc],
  );

  const logout = useCallback(async () => {
    await api.post('/auth/logout').catch(() => undefined);
    qc.clear();
    qc.setQueryData(['me'], null);
  }, [qc]);

  const value: AuthState = {
    me,
    settings: settingsQuery.data ?? null,
    loading: meQuery.isLoading,
    can,
    canAny,
    login,
    logout,
    refresh: () => meQuery.refetch(),
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

/** Hides children unless the user holds at least one of the permissions. UI convenience only – the API enforces. */
export function Can({ any, children, fallback = null }: { any: Permission[]; children: ReactNode; fallback?: ReactNode }) {
  const { canAny } = useAuth();
  return <>{canAny(...any) ? children : fallback}</>;
}
