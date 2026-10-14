import { useCallback, useState } from 'react';
import { Navigation, type PageId } from './components/Navigation';
import { useLeads } from './lib/useLeads';
import { AddLeadPage } from './pages/AddLeadPage';
import { DashboardPage } from './pages/DashboardPage';
import { LeadsPage } from './pages/LeadsPage';

/**
 * Application shell: responsive navigation + the active page.
 * Routing is a simple useState — no router dependency needed for 3 pages.
 * Leads come from the combined store (migrated CSV + session memory);
 * Firebase is intentionally not connected until Phase 5.
 */
export default function App() {
  const [page, setPage] = useState<PageId>('dashboard');
  const [revision, setRevision] = useState(0);
  const { leads, ready } = useLeads(revision);

  const refreshLeads = useCallback(() => {
    setRevision((value) => value + 1);
  }, []);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto flex min-h-screen max-w-7xl">
        <Navigation active={page} onNavigate={setPage} />
        <main className="min-w-0 flex-1">
          <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
            {page === 'dashboard' ? <DashboardPage leads={leads} ready={ready} /> : null}
            {page === 'leads' ? <LeadsPage leads={leads} ready={ready} /> : null}
            {page === 'add-lead' ? <AddLeadPage onLeadSaved={refreshLeads} /> : null}
          </div>
        </main>
      </div>
    </div>
  );
}
