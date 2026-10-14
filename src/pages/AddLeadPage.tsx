import { useState } from 'react';
import { LeadForm } from '../components/LeadForm';
import { PageHeader } from '../components/PageHeader';
import { SessionLeadsPanel } from '../components/SessionLeadsPanel';
import type { Lead } from '../lib/types';

/**
 * Add Lead screen (Phase 3): validated form + live dealer preview.
 * Storage goes through LeadRepository, which is in-memory until Phase 5,
 * so the UI never claims a lead reached a server.
 */
export function AddLeadPage() {
  const [sessionLeads, setSessionLeads] = useState<Lead[]>([]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Add Lead"
        subtitle="Enter a customer lead — mobile and pincode are validated and the dealer is assigned automatically."
      />
      <LeadForm onSaved={(lead) => setSessionLeads((previous) => [lead, ...previous])} />
      <SessionLeadsPanel leads={sessionLeads} />
    </div>
  );
}
