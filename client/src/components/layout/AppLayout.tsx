import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Bell, ChevronRight, CornerDownLeft, KeyRound, LogOut, Menu, PanelLeftClose, PanelLeftOpen, Search, UserRound, X } from 'lucide-react';
import { enumLabel } from '../../i18n';
import { useAuth } from '../../auth/AuthProvider';
import { NAVIGATION, SEARCH_TARGETS, isNavActive } from './navigation';
import { cn } from '../../lib/cn';
import { BrandMark } from '../ui/Layout';
import { api } from '../../lib/api';
import { relativeTime } from '../../lib/format';
import type { Notification } from '../../lib/types';
import { translate } from '../../i18n';
import { LanguageSwitch } from './LanguageSwitch';

function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2.5 px-1">
      <BrandMark />
      <span className="leading-tight">
        <span className="block text-[16px] font-bold tracking-tight text-white">SalesPro</span>
        <span className="block text-[11px] font-medium tracking-wide text-slate-400">CRM</span>
      </span>
    </Link>
  );
}

const initialsOf = (name: string) => name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();

function SidebarAccount() {
  const { me, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false), open);
  if (!me) return null;
  return (
    <div className="relative border-t border-white/10 p-3" ref={ref}>
      {open && (
        <div role="menu" className="absolute right-3 bottom-full left-3 mb-2 overflow-hidden rounded-xl border border-white/10 bg-navy-800 py-1 shadow-xl">
          <div className="border-b border-white/10 px-4 py-2.5">
            <p className="truncate text-xs text-slate-400">{me.user.email}</p>
            {me.user.team && <p className="mt-0.5 truncate text-xs text-slate-400">{translate('Team: {name}', { name: me.user.team.name })}</p>}
          </div>
          <Link role="menuitem" to="/profile" onClick={() => setOpen(false)} className="flex items-center gap-2 px-4 py-2 text-sm text-slate-200 hover:bg-white/5">
            <UserRound className="size-4" /> {translate('My profile')}
          </Link>
          <Link role="menuitem" to="/profile" onClick={() => setOpen(false)} className="flex items-center gap-2 px-4 py-2 text-sm text-slate-200 hover:bg-white/5">
            <KeyRound className="size-4" /> {translate('Change password')}
          </Link>
          <button
            role="menuitem"
            onClick={() => logout()}
            className="flex w-full items-center gap-2 px-4 py-2 text-sm text-rose-300 hover:bg-white/5"
          >
            <LogOut className="size-4" /> {translate('Sign out')}
          </button>
        </div>
      )}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-white/[0.06]"
      >
        <span className="relative flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-semibold text-white">
          {initialsOf(me.user.name)}
          <span className="absolute right-0 bottom-0 size-2.5 rounded-full bg-emerald-400 ring-2 ring-navy-950" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold text-white">{me.user.name}</span>
          <span className="block truncate text-[11px] text-slate-400">{me.roles.map(enumLabel).join(', ')}</span>
        </span>
        <ChevronRight className={cn('size-4 text-slate-400 transition-transform', open && '-rotate-90')} aria-hidden />
      </button>
    </div>
  );
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { canAny } = useAuth();
  const location = useLocation();
  return (
    <nav aria-label={translate('Main navigation')} className="flex h-full flex-col bg-navy-950">
      <div className="flex h-16 items-center px-5">
        <Logo />
      </div>
      <div className="flex-1 space-y-5 overflow-y-auto px-3 pt-2 pb-6">
        {NAVIGATION.map((section) => {
          const items = section.items.filter((i) => !i.any.length || canAny(...i.any));
          if (!items.length) return null;
          return (
            <div key={section.title || 'main'}>
              {section.title && (
                <p className="mb-1.5 px-3 text-[10px] font-semibold tracking-[0.12em] text-slate-500">{translate(section.title)}</p>
              )}
              <ul className="space-y-1">
                {items.map((item) => (
                  <li key={`${section.title}-${item.to}`}>
                    <NavLink
                      to={item.to}
                      end={item.to === '/'}
                      onClick={onNavigate}
                      className={() =>
                        cn(
                          'flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors',
                          isNavActive(item.to, location.pathname, location.search)
                            ? 'bg-brand-500 text-white'
                            : 'text-slate-300/85 hover:bg-white/[0.06] hover:text-white',
                        )
                      }
                    >
                      <item.icon className="size-[18px] shrink-0" aria-hidden />
                      {translate(item.label)}
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

interface SearchOption {
  key: string;
  to: string;
  label: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
}

function GlobalSearch() {
  const navigate = useNavigate();
  const { canAny } = useAuth();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false), open);

  const text = q.trim();
  const allowed = (any: string[]) => !any.length || canAny(...(any as never[]));
  const options: SearchOption[] = text
    ? [
        ...SEARCH_TARGETS.filter((t) => allowed(t.any)).map((t) => ({
          key: `search-${t.to}`,
          to: `${t.to}?q=${encodeURIComponent(text)}`,
          label: translate('Search {target} for “{q}”', { target: translate(t.label), q: text }),
          hint: translate(t.label),
          icon: t.icon,
        })),
        ...NAVIGATION.flatMap((sec) => sec.items)
          .filter((i) => allowed(i.any) && (i.label.toLowerCase().includes(text.toLowerCase()) || translate(i.label).includes(text)))
          .map((i) => ({ key: `page-${i.to}`, to: i.to, label: translate(i.label), hint: translate('Go to page'), icon: i.icon })),
      ]
    : [];

  const go = (o?: SearchOption) => {
    if (!o) return;
    navigate(o.to);
    setOpen(false);
    setQ('');
  };

  return (
    <div className="relative hidden w-full max-w-md md:block" ref={ref}>
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          go(options[active]);
        }}
      >
        <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, options.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === 'Escape') {
              setOpen(false);
              (e.target as HTMLInputElement).blur();
            }
          }}
          placeholder={translate('Search anything...')}
          aria-label={translate('Search anything')}
          role="combobox"
          aria-expanded={open && options.length > 0}
          aria-controls="global-search-results"
          aria-activedescendant={open && options[active] ? options[active].key : undefined}
          className="h-10 w-full rounded-xl border border-slate-200 bg-white pr-16 pl-10 text-[13px] shadow-sm placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none"
        />
        <kbd className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-400">
          Ctrl K
        </kbd>
      </form>
      {open && options.length > 0 && (
        <ul id="global-search-results" role="listbox" className="absolute right-0 left-0 z-40 mt-2 max-h-80 overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
          {options.map((o, i) => (
            <li key={o.key} id={o.key} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => go(o)}
                className={cn('flex w-full items-center gap-3 px-3 py-2 text-left text-sm', i === active ? 'bg-brand-50 text-brand-800' : 'text-slate-700')}
              >
                <o.icon className="size-4 shrink-0 text-slate-400" aria-hidden />
                <span className="min-w-0 flex-1 truncate">{o.label}</span>
                <span className="shrink-0 text-xs text-slate-400">{o.hint}</span>
                {i === active && <CornerDownLeft className="size-3.5 shrink-0 text-slate-400" aria-hidden />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
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
        className="relative rounded-xl p-2 text-slate-500 hover:bg-white hover:text-slate-800 hover:shadow-sm"
        aria-label={`${translate('Notifications')}${unread ? ` (${unread})` : ''}`}
        aria-expanded={open}
      >
        <Bell className="size-5" />
        {unread > 0 && (
          <span className="tabular absolute -top-0.5 -right-0.5 flex min-w-[18px] items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] leading-4 font-bold text-white ring-2 ring-[#f5f6fa]">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-[0_16px_40px_-12px_rgb(16_24_64/0.25)]">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-semibold">{translate('Notifications')}</p>
            {unread > 0 && (
              <button
                className="text-xs font-medium text-brand-600 hover:text-brand-700"
                onClick={async () => {
                  await api.post('/notifications/read-all');
                  void refetch();
                }}
              >
                {translate('Mark all as read')}
              </button>
            )}
          </div>
          <ul className="max-h-96 overflow-y-auto">
            {!data?.data.length && <li className="px-4 py-8 text-center text-sm text-slate-500">{translate('No notifications yet.')}</li>}
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
            {translate('View all notifications')}
          </Link>
        </div>
      )}
    </div>
  );
}

const SIDEBAR_KEY = 'salespro.sidebar';

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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        document.querySelector<HTMLInputElement>('form[role="search"] input')?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const toggleDesktop = () => {
    const next = !desktopOpen;
    setDesktopOpen(next);
    saveSidebarPref(next);
  };

  return (
    <div className="min-h-screen bg-[#f5f6fa]">
      <a href="#main" className="sr-only z-50 rounded bg-white px-3 py-2 focus:not-sr-only focus:fixed focus:top-2 focus:left-2">
        {translate('Skip to content')}
      </a>
      <aside
        inert={!desktopOpen}
        className={cn(
          'fixed inset-y-0 left-0 z-30 hidden w-[228px] transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] lg:block',
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
          aria-label={translate("Menu")}
          className={cn(
            'absolute inset-y-0 left-0 w-72 max-w-[85vw] shadow-xl transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]',
            mobileOpen ? 'translate-x-0' : '-translate-x-full',
          )}
        >
          <button onClick={() => setMobileOpen(false)} className="absolute top-4 right-3 z-10 rounded-md p-1 text-slate-400 hover:text-white" aria-label={translate('Close menu')}>
            <X className="size-5" />
          </button>
          <Sidebar onNavigate={() => setMobileOpen(false)} />
        </aside>
      </div>

      <div className={cn('transition-[padding] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]', desktopOpen && 'lg:pl-[228px]')}>
        <header className="sticky top-0 z-20 bg-[#f5f6fa]/85 backdrop-blur">
          <div className="flex h-16 items-center gap-2 px-4 sm:px-6">
            <button
              onClick={() => setMobileOpen(true)}
              className="-ml-2 rounded-lg p-2 text-slate-500 hover:bg-white lg:hidden"
              aria-label={translate('Open menu')}
              aria-expanded={mobileOpen}
            >
              <Menu className="size-5" />
            </button>
            <button
              onClick={toggleDesktop}
              className="-ml-2 hidden rounded-lg p-2 text-slate-400 hover:bg-white hover:text-slate-800 lg:inline-flex"
              aria-label={translate(desktopOpen ? 'Hide sidebar' : 'Show sidebar')}
              aria-expanded={desktopOpen}
              title={translate(desktopOpen ? 'Hide sidebar' : 'Show sidebar')}
            >
              {desktopOpen ? <PanelLeftClose className="size-5" /> : <PanelLeftOpen className="size-5" />}
            </button>
            <div className="flex flex-1 justify-center">
              <GlobalSearch />
            </div>
            <div className="ml-auto flex items-center gap-1 md:ml-0">
              <LanguageSwitch />
              <NotificationBell />
            </div>
          </div>
        </header>
        <main id="main" className="px-4 pb-10 sm:px-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
