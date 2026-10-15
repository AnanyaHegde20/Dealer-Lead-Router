import type { ReactNode } from 'react';
import { ChartIcon, PlusIcon, UsersIcon, ZapIcon } from './icons';

/** The three sections of the application. */
export type PageId = 'dashboard' | 'leads' | 'add-lead';

interface NavItem {
  id: PageId;
  label: string;
  icon: ReactNode;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: <ChartIcon className="h-5 w-5" /> },
  { id: 'leads', label: 'Leads', icon: <UsersIcon className="h-5 w-5" /> },
  { id: 'add-lead', label: 'Add Lead', icon: <PlusIcon className="h-5 w-5" /> },
];

interface NavigationProps {
  active: PageId;
  onNavigate: (page: PageId) => void;
  /** Signed-in user's email, or null in local mode (no cloud account). */
  userEmail?: string | null;
  /** Present only when Firebase is configured. */
  onSignOut?: () => void;
}

function Brand() {
  return (
    <div className="flex items-center gap-3">
      <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-500 text-slate-950">
        <ZapIcon className="h-6 w-6" />
      </span>
      <div>
        <p className="text-sm font-semibold leading-tight text-white">PURE Energy</p>
        <p className="text-xs text-slate-400">Dealer Lead Router</p>
      </div>
    </div>
  );
}

function itemClasses(active: boolean, mobile: boolean): string {
  if (mobile) {
    return [
      'flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition',
      active ? 'bg-emerald-500 text-slate-950' : 'text-slate-300 hover:bg-white/10 hover:text-white',
    ].join(' ');
  }
  return [
    'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition border-l-4',
    active
      ? 'border-emerald-500 bg-white/10 text-white'
      : 'border-transparent text-slate-300 hover:bg-white/5 hover:text-white',
  ].join(' ');
}

/** Responsive navigation: dark sidebar on desktop, top bar on mobile. */
export function Navigation({ active, onNavigate, userEmail = null, onSignOut }: NavigationProps) {
  return (
    <>
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-slate-800 bg-slate-900 lg:flex">
        <div className="border-b border-slate-800 px-6 py-6">
          <Brand />
        </div>
        <nav className="flex-1 space-y-1 px-3 py-4" aria-label="Main">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              aria-current={active === item.id ? 'page' : undefined}
              className={itemClasses(active === item.id, false)}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        {userEmail ? (
          <div className="border-t border-slate-800 px-6 py-4">
            <p className="truncate text-xs text-slate-400" title={userEmail}>
              Signed in as {userEmail}
            </p>
            <button
              type="button"
              onClick={onSignOut}
              className="mt-2 w-full rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-slate-800 hover:text-white focus:outline-none focus:ring-2 focus:ring-emerald-400"
            >
              Sign out
            </button>
          </div>
        ) : null}
      </aside>

      <header className="sticky top-0 z-20 bg-slate-900 lg:hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <Brand />
          {userEmail ? (
            <button
              type="button"
              onClick={onSignOut}
              className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-slate-800 hover:text-white focus:outline-none focus:ring-2 focus:ring-emerald-400"
            >
              Sign out
            </button>
          ) : null}
        </div>
        <nav
          className="flex gap-1 overflow-x-auto px-2 pb-2"
          aria-label="Main"
        >
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              aria-current={active === item.id ? 'page' : undefined}
              className={itemClasses(active === item.id, true)}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
      </header>
    </>
  );
}
