import { EmptyState } from '../components/EmptyState';
import { PageHeader } from '../components/PageHeader';
import { UsersIcon } from '../components/icons';

/**
 * Leads list. No Firebase connection in Phase 2, so there is nothing to
 * list yet — an empty state is shown rather than sample rows.
 */
export function LeadsPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Leads" subtitle="All customer leads with their assigned dealer" />

      <EmptyState
        icon={<UsersIcon className="h-6 w-6" />}
        title="No leads stored yet"
        description="Leads saved through the Add Lead form will be written to Cloud Firestore and listed here with their dealer, status and pincode. No sample rows are shown on purpose."
      >
        <p className="text-xs">
          The 31 cleaned legacy leads from data-out/cleaned_leads.csv will be loaded during the
          data-migration step (Phase 5).
        </p>
      </EmptyState>
    </div>
  );
}
