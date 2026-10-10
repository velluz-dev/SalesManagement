import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Bell, ChevronDown, FlaskConical, KeyRound, LogOut, Menu, X } from 'lucide-react';
import { enumLabel } from '@crm/shared';
import { useAuth } from '../../auth/AuthProvider';
import { NAVIGATION } from './navigation';
import { cn } from '../../lib/cn';
import { api } from '../../lib/api';
import { relativeTime } from '../../lib/format';
import type { Notification } from '../../lib/types';

function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2.5 px-2">
      <span className="flex size-8 items-center justify-center rounded-lg bg-brand-600 text-white shadow-sm">
        <svg viewBox="0 0 32 32" className="size-5" aria-hidden>
          <path d="M7 22l6-7 5 4 7-9" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span className="text-base font-semibold tracking-tight text-white">SalesHub</span>
    </Link>
  );
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { canAny } = useAuth();
  return (
    <nav aria-label="Main navigation" className="flex h-full flex-col bg-slate-900">
      <div className="flex h-16 items-center border-b border-white/10 px-4">
        <Logo />
      </div>
      <div className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
        {NAVIGATION.map((section) => {
          const items = section.items.filter((i) => !i.any.length || canAny(...i.any));
          if (!items.length) return null;
          return (
            <div key={section.title}>
              <p className="mb-1.5 px-3 text-[11px] font-semibold tracking-wider text-slate-500 uppercase">{section.title}</p>
              <ul className="space-y-0.5">
                {items.map((item) => (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      end={item.to === '/'}
                      onClick={onNavigate}
                      className={({ isActive }) =>
                        cn(
                          'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                          isActive ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-white',
                        )
                      }
                    >
                      <item.icon className="size-4 shrink-0" aria-hidden />
                      {item.label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </nav>
  );
}

function useClickOutside(ref: React.RefObject<HTMLElement | null>, onOutside: () => void, active: boolean) {
  useEffect(() => {
    if (!active) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutside();
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onOutside();
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', esc);
    };
  }, [ref, onOutside, active]);
}

function NotificationBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  useClickOutside(ref, () => setOpen(false), open);
  const { data, refetch } = useQuery({
    queryKey: ['notifications', 'bell'],
    queryFn: () => api.get<{ data: Notification[]; unread: number }>('/notifications', { pageSize: 8 }),
    refetchInterval: 60_000,
  });
  const unread = data?.unread ?? 0;

  const openItem = async (n: Notification) => {
    if (!n.readAt) await api.post(`/notifications/${n.id}/read`).catch(() => undefined);
    setOpen(false);
    void refetch();
    if (n.link) navigate(n.link);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
        aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
        aria-expanded={open}
      >
        <Bell className="size-5" />
        {unread > 0 && (
          <span className="absolute top-1 right-1 flex min-w-[18px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-semibold">Notifications</p>
            {unread > 0 && (
              <button
                className="text-xs font-medium text-brand-600 hover:text-brand-700"
                onClick={async () => {
                  await api.post('/notifications/read-all');
                  void refetch();
                }}
              >
                Mark all as read
              </button>
            )}
          </div>
          <ul className="max-h-96 overflow-y-auto">
            {!data?.data.length && <li className="px-4 py-8 text-center text-sm text-slate-500">You're all caught up.</li>}
            {data?.data.map((n) => (
              <li key={n.id}>
                <button onClick={() => openItem(n)} className="flex w-full gap-3 border-b border-slate-50 px-4 py-3 text-left hover:bg-slate-50">
                  <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', n.readAt ? 'bg-transparent' : 'bg-brand-500')} aria-hidden />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-slate-900">{n.title}</span>
                    <span className="block text-xs text-slate-500">{n.message}</span>
                    <span className="mt-0.5 block text-[11px] text-slate-400">{relativeTime(n.createdAt)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <Link to="/notifications" onClick={() => setOpen(false)} className="block border-t border-slate-100 px-4 py-2.5 text-center text-sm font-medium text-brand-600 hover:bg-slate-50">
            View all notifications
          </Link>
        </div>
      )}
    </div>
  );
}

function UserMenu() {
  const { me, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  useClickOutside(ref, () => setOpen(false), open);
  if (!me) return null;
  const initials = me.user.name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 rounded-lg p-1.5 hover:bg-slate-100" aria-expanded={open} aria-haspopup="menu">
        <span className="flex size-8 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">{initials}</span>
        <span className="hidden text-left sm:block">
          <span className="block text-sm leading-tight font-medium text-slate-900">{me.user.name}</span>
          <span className="block text-xs leading-tight text-slate-500">{me.roles.map(enumLabel).join(', ')}</span>
        </span>
        <ChevronDown className="hidden size-4 text-slate-400 sm:block" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-40 mt-2 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
          <div className="border-b border-slate-100 px-4 py-2.5">
            <p className="truncate text-sm font-medium">{me.user.name}</p>
            <p className="truncate text-xs text-slate-500">{me.user.email}</p>
            {me.user.team && <p className="mt-1 text-xs text-slate-500">Team: {me.user.team.name}</p>}
          </div>
          <Link role="menuitem" to="/profile" onClick={() => setOpen(false)} className="flex items-center gap-2 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
            <KeyRound className="size-4" /> Change password
          </Link>
          <button
            role="menuitem"
            onClick={async () => {
              await logout();
              navigate('/login');
            }}
            className="flex w-full items-center gap-2 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            <LogOut className="size-4" /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

export function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { settings } = useAuth();
  const location = useLocation();
  useEffect(() => setMobileOpen(false), [location.pathname]);

  return (
    <div className="min-h-screen">
      <a href="#main" className="sr-only z-50 rounded bg-white px-3 py-2 focus:not-sr-only focus:fixed focus:top-2 focus:left-2">
        Skip to content
      </a>
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 lg:block">
        <Sidebar />
      </aside>
      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setMobileOpen(false)} aria-hidden />
          <aside className="absolute inset-y-0 left-0 w-72 shadow-xl">
            <button onClick={() => setMobileOpen(false)} className="absolute top-4 right-3 z-10 rounded-md p-1 text-slate-400 hover:text-white" aria-label="Close menu">
              <X className="size-5" />
            </button>
            <Sidebar onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <div className="lg:pl-64">
        {settings?.demoData && (
          <div className="flex items-center justify-center gap-2 bg-amber-100 px-4 py-1.5 text-center text-xs font-medium text-amber-900">
            <FlaskConical className="size-3.5" aria-hidden />
            Demo environment — all records are fictional sample data for development and testing.
          </div>
        )}
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur sm:px-6">
          <button onClick={() => setMobileOpen(true)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden" aria-label="Open menu">
            <Menu className="size-5" />
          </button>
          <p className="hidden truncate text-sm text-slate-500 sm:block">{settings?.['company.name']}</p>
          <div className="ml-auto flex items-center gap-1">
            <NotificationBell />
            <UserMenu />
          </div>
        </header>
        <main id="main" className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
