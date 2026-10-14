import { useState } from 'react';
import { LeadForm } from '../components/LeadForm';
import { PageHeader } from '../components/PageHeader';
import { SessionLeadsPanel } from '../components/SessionLeadsPanel';
import type { Lead } from '../lib/types';

interface AddLeadPageProps {
  /** Bubbles up so Dashboard/Leads re-read the store after a save. */
  onLeadSaved?: () => void;
}

/**
 * Add Lead screen (Phase 3): validated form + live dealer preview.
 * Storage goes through LeadRepository, which is in-memory until Phase 5,
 * so the UI never claims a lead reached a server.
 */
export function AddLeadPage({ onLeadSaved }: AddLeadPageProps) {
  const [sessionLeads, setSessionLeads] = useState<Lead[]>([]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Add Lead"
        subtitle="Enter a customer lead — mobile and pincode are validated and the dealer is assigned automatically."
      />
      <LeadForm
        onSaved={(lead) => {
          setSessionLeads((previous) => [lead, ...previous]);
          onLeadSaved?.();
        }}
      />
      <SessionLeadsPanel leads={sessionLeads} />
    </div>
  );
}
