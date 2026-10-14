import { DealerRoster } from '../components/DealerRoster';
import { EmptyState } from '../components/EmptyState';
import { PageHeader } from '../components/PageHeader';
import { ChartIcon } from '../components/icons';

/**
 * Dashboard: will show lead counts by dealer and by status.
 * Phase 2 has no stored leads, so it renders an honest empty state
 * plus the real dealer routing table.
 */
export function DashboardPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" subtitle="Lead counts by dealer and by status" />

      <EmptyState
        icon={<ChartIcon className="h-6 w-6" />}
        title="No lead data yet"
        description="Counts by dealer and by status will appear here once leads are stored in Cloud Firestore. This build intentionally shows no numbers instead of made-up ones."
      >
        <ul className="mx-auto mt-1 list-inside list-disc space-y-1 text-left">
          <li>Leads per dealer (D01–D08 and In-house Sales)</li>
          <li>Leads per status (New, Contacted, Converted, Lost)</li>
        </ul>
      </EmptyState>

      <DealerRoster />
    </div>
  );
}
