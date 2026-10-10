import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import type { Permission } from '@shared';
import { useAuth } from './AuthProvider';
import { FullPageSpinner } from '../components/ui/Spinner';
import { EmptyState } from '../components/ui/EmptyState';
import { ShieldAlert } from 'lucide-react';
import { translate } from '../i18n';

export function RequireAuth() {
  const { me, loading } = useAuth();
  const location = useLocation();
  if (loading) return <FullPageSpinner />;
  if (!me) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  if (me.user.mustChangePassword && location.pathname !== '/profile') {
    return <Navigate to="/profile" replace state={{ forced: true }} />;
  }
  return <Outlet />;
}

export function RequirePermission({ any, children }: { any: Permission[]; children: ReactNode }) {
  const { canAny } = useAuth();
  if (!canAny(...any)) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title={translate("Access restricted")}
        description="Your role does not include access to this page. Contact your administrator if you believe this is a mistake."
      />
    );
  }
  return <>{children}</>;
}
