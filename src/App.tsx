import { useState } from 'react';
import { Navigation, type PageId } from './components/Navigation';
import { AddLeadPage } from './pages/AddLeadPage';
import { DashboardPage } from './pages/DashboardPage';
import { LeadsPage } from './pages/LeadsPage';

/**
 * Application shell: responsive navigation + the active page.
 * Routing is a simple useState — no router dependency needed for 3 pages.
 * Firebase is intentionally not connected in Phase 2.
 */
export default function App() {
  const [page, setPage] = useState<PageId>('dashboard');

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto flex min-h-screen max-w-7xl">
        <Navigation active={page} onNavigate={setPage} />
        <main className="min-w-0 flex-1">
          <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
            {page === 'dashboard' ? <DashboardPage /> : null}
            {page === 'leads' ? <LeadsPage /> : null}
            {page === 'add-lead' ? <AddLeadPage /> : null}
          </div>
        </main>
      </div>
    </div>
  );
}
