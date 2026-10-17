import { useCallback, useState } from 'react';
import { Navigation, type PageId } from './components/Navigation';
import { resolveAppAccess, signOut } from './lib/auth';
import { useAuth } from './lib/useAuth';
import { shouldLoadLeads, useLeads } from './lib/useLeads';
import { AddLeadPage } from './pages/AddLeadPage';
import { DashboardPage } from './pages/DashboardPage';
import { LeadsPage } from './pages/LeadsPage';
import { SignInPage } from './pages/SignInPage';

/**
 * Application shell: responsive navigation + the active page.
 * Routing is a simple useState — no router dependency needed for 3 pages.
 *
 * Auth gate:
 *   - Firebase configured & no user  → only <SignInPage> (data stays protected)
 *   - Firebase configured & user in  → the app, signed-in identity visible
 *   - no configuration (LOCAL mode)  → the app over bundled CSV + tab memory,
 *                                       clearly labelled with an amber banner
 */
export default function App() {
  const { user, initializing, configured } = useAuth();
  // Auth gate is resolved BEFORE any data hook runs: leads are only fetched
  // once the app shell is actually visible (signed in, or local mode).
  const access = resolveAppAccess({ configured, initializing, user });
  const [page, setPage] = useState<PageId>('dashboard');
  const [revision, setRevision] = useState(0);
  const { leads, ready } = useLeads(revision, shouldLoadLeads(access));

  const refreshLeads = useCallback(() => {
    setRevision((value) => value + 1);
  }, []);

  const handleSignOut = useCallback(() => {
    void signOut().catch(() => {
      // Sign-out failures keep the user signed in; nothing else to do here.
    });
  }, []);

  if (access === 'splash') {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-950">
        <p className="text-sm text-slate-400" role="status">
          Loading…
        </p>
      </div>
    );
  }

  if (access === 'signin') {
    return <SignInPage />;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {!configured ? (
        <div className="border-b border-amber-300 bg-amber-100 px-4 py-2 text-center text-xs font-medium text-amber-900 sm:px-6">
          Local mode — no Firebase project configured (.env missing or empty).
          Showing bundled migrated leads plus this session&rsquo;s additions;
          nothing is stored in the cloud. See FIREBASE_SETUP.md.
        </div>
      ) : null}
      <div className="mx-auto flex min-h-screen max-w-7xl">
        <Navigation
          active={page}
          onNavigate={setPage}
          userEmail={user?.email ?? null}
          onSignOut={configured ? handleSignOut : undefined}
        />
        <main className="min-w-0 flex-1">
          <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
            {page === 'dashboard' ? <DashboardPage leads={leads} ready={ready} /> : null}
            {page === 'leads' ? (
              <LeadsPage leads={leads} ready={ready} onLeadUpdated={refreshLeads} />
            ) : null}
            {page === 'add-lead' ? <AddLeadPage onLeadSaved={refreshLeads} /> : null}
          </div>
        </main>
      </div>
    </div>
  );
}
