import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Bell, ChevronDown, FlaskConical, KeyRound, LogOut, Menu, PanelLeftClose, PanelLeftOpen, X } from 'lucide-react';
import { enumLabel } from '@shared';
import { useAuth } from '../../auth/AuthProvider';
import { NAVIGATION } from './navigation';
import { cn } from '../../lib/cn';
import { BrandMark } from '../ui/Layout';
import { api } from '../../lib/api';
import { relativeTime } from '../../lib/format';
import type { Notification } from '../../lib/types';

function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2.5 px-2">
      <BrandMark />
      <span className="text-[17px] font-semibold tracking-tight text-white">SalesHub</span>
    </Link>
  );
}

const initialsOf = (name: string) => name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();

function SidebarAccount() {
  const { me, logout } = useAuth();
  const navigate = useNavigate();
  if (!me) return null;
  return (
    <div className="border-t border-white/10 px-3 py-3">
      <div className="flex items-center gap-3 px-3 py-2">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-semibold text-marigold-300">{initialsOf(me.user.name)}</span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-white">{me.user.name}</p>
          <p className="truncate text-xs text-brand-200/70">{me.user.email}</p>
        </div>
      </div>
      <button
        onClick={async () => {
          await logout();
          navigate('/login');
        }}
        className="mt-1 flex w-full items-center gap-3 rounded-md px-3 py-[7px] text-sm text-brand-100/75 hover:bg-white/[0.04] hover:text-white"
      >
        <LogOut className="size-4 shrink-0" aria-hidden />
        Sign out
      </button>
    </div>
  );
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { canAny } = useAuth();
  return (
    <nav aria-label="Main navigation" className="flex h-full flex-col bg-brand-950">
      <div className="flex h-14 items-center px-4">
        <Logo />
      </div>
      <div className="flex-1 space-y-5 overflow-y-auto px-3 pt-3 pb-6">
        {NAVIGATION.map((section) => {
          const items = section.items.filter((i) => !i.any.length || canAny(...i.any));
          if (!items.length) return null;
          return (
            <div key={section.title}>
              <p className="mb-1 px-3 text-xs text-brand-300/70">{section.title}</p>
              <ul className="space-y-0.5">
                {items.map((item) => (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      end={item.to === '/'}
                      onClick={onNavigate}
                      className={({ isActive }) =>
                        cn(
                          'flex items-center gap-3 rounded-md px-3 py-[7px] text-sm',
                          isActive
                            ? 'bg-white/[0.07] font-medium text-white shadow-[inset_3px_0_0_var(--color-marigold-400)]'
                            : 'text-brand-100/75 hover:bg-white/[0.04] hover:text-white',
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
      <SidebarAccount />
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
        className="relative rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
        aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
        aria-expanded={open}
      >
        <Bell className="size-5" />
        {unread > 0 && (
          <span className="tabular absolute top-0.5 right-0.5 flex min-w-[18px] items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] leading-4 font-semibold text-white ring-2 ring-white">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[0_10px_30px_-12px_rgb(24_34_30/0.3)]">
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
            {!data?.data.length && <li className="px-4 py-8 text-center text-sm text-slate-500">No notifications yet.</li>}
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
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 rounded-md p-1.5 hover:bg-slate-100" aria-expanded={open} aria-haspopup="menu">
        <span className="flex size-8 items-center justify-center rounded-full bg-brand-900 text-xs font-semibold text-marigold-300">{initialsOf(me.user.name)}</span>
        <span className="hidden text-left sm:block">
          <span className="block text-sm leading-tight font-medium text-slate-900">{me.user.name}</span>
          <span className="block text-xs leading-tight text-slate-500">{me.roles.map(enumLabel).join(', ')}</span>
        </span>
        <ChevronDown className="hidden size-4 text-slate-400 sm:block" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-40 mt-2 w-56 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-[0_10px_30px_-12px_rgb(24_34_30/0.3)]">
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

const SIDEBAR_KEY = 'saleshub.sidebar';

function readSidebarPref() {
  try {
    return localStorage.getItem(SIDEBAR_KEY) !== 'closed';
  } catch {
    return true;
  }
}

function saveSidebarPref(open: boolean) {
  try {
    localStorage.setItem(SIDEBAR_KEY, open ? 'open' : 'closed');
  } catch {
    return;
  }
}

export function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktopOpen, setDesktopOpen] = useState(readSidebarPref);
  const { settings } = useAuth();
  const location = useLocation();
  useEffect(() => setMobileOpen(false), [location.pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const close = (e: KeyboardEvent) => e.key === 'Escape' && setMobileOpen(false);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', close);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener('keydown', close);
    };
  }, [mobileOpen]);

  const toggleDesktop = () => {
    const next = !desktopOpen;
    setDesktopOpen(next);
    saveSidebarPref(next);
  };

  return (
    <div className="min-h-screen">
      <a href="#main" className="sr-only z-50 rounded bg-white px-3 py-2 focus:not-sr-only focus:fixed focus:top-2 focus:left-2">
        Skip to content
      </a>
      <aside
        inert={!desktopOpen}
        className={cn(
          'fixed inset-y-0 left-0 z-30 hidden w-64 transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] lg:block',
          !desktopOpen && '-translate-x-full',
        )}
      >
        <Sidebar />
      </aside>

      <div inert={!mobileOpen} className={cn('fixed inset-0 z-40 lg:hidden', !mobileOpen && 'pointer-events-none')}>
        <div
          className={cn('absolute inset-0 bg-slate-950/45 transition-opacity duration-300', mobileOpen ? 'opacity-100' : 'opacity-0')}
          onClick={() => setMobileOpen(false)}
          aria-hidden
        />
        <aside
          aria-label="Menu"
          className={cn(
            'absolute inset-y-0 left-0 w-72 max-w-[85vw] shadow-xl transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]',
            mobileOpen ? 'translate-x-0' : '-translate-x-full',
          )}
        >
          <button onClick={() => setMobileOpen(false)} className="absolute top-3.5 right-3 z-10 rounded-md p-1 text-brand-200 hover:text-white" aria-label="Close menu">
            <X className="size-5" />
          </button>
          <Sidebar onNavigate={() => setMobileOpen(false)} />
        </aside>
      </div>

      <div className={cn('transition-[padding] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]', desktopOpen && 'lg:pl-64')}>
        {settings?.demoData && (
          <div className="flex items-center justify-center gap-2 bg-marigold-300/40 px-4 py-1.5 text-center text-xs font-medium text-slate-800">
            <FlaskConical className="size-3.5 shrink-0" aria-hidden />
            Demo environment. Every record here is made up for development and testing.
          </div>
        )}
        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-slate-200 bg-white px-4 sm:px-6">
          <button
            onClick={() => setMobileOpen(true)}
            className="-ml-2 rounded-md p-2 text-slate-500 hover:bg-slate-100 lg:hidden"
            aria-label="Open menu"
            aria-expanded={mobileOpen}
          >
            <Menu className="size-5" />
          </button>
          <button
            onClick={toggleDesktop}
            className="-ml-2 hidden rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800 lg:inline-flex"
            aria-label={desktopOpen ? 'Hide sidebar' : 'Show sidebar'}
            aria-expanded={desktopOpen}
            title={desktopOpen ? 'Hide sidebar' : 'Show sidebar'}
          >
            {desktopOpen ? <PanelLeftClose className="size-5" /> : <PanelLeftOpen className="size-5" />}
          </button>
          <p className="hidden truncate text-sm font-medium text-slate-700 sm:block">{settings?.['company.name']}</p>
          <div className="ml-auto flex items-center gap-1">
            <NotificationBell />
            <UserMenu />
          </div>
        </header>
        <main id="main" className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
