import type { Lead } from '../lib/types';

interface SessionLeadsPanelProps {
  leads: Lead[];
}

/**
 * Leads submitted in this browser session, with an explicit warning that
 * they live in memory only. This replaces any temptation to show fake
 * dashboard numbers: these rows are real submissions, clearly labelled.
 */
export function SessionLeadsPanel({ leads }: SessionLeadsPanelProps) {
  if (leads.length === 0) {
    return null;
  }
  return (
    <section className="overflow-hidden rounded-2xl border border-amber-200 bg-white shadow-sm">
      <div className="border-b border-amber-100 bg-amber-50 px-5 py-4">
        <h2 className="text-sm font-semibold text-amber-900">
          Leads created this session ({leads.length})
        </h2>
        <p className="mt-0.5 text-xs text-amber-800">
          Held in temporary browser memory only — refreshing the page clears them. No server has
          received these rows; Cloud Firestore replaces this store in Phase 5.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-100 text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-5 py-3 font-medium">Lead</th>
              <th className="px-5 py-3 font-medium">Name</th>
              <th className="px-5 py-3 font-medium">Mobile</th>
              <th className="px-5 py-3 font-medium">Pincode</th>
              <th className="px-5 py-3 font-medium">Dealer</th>
              <th className="px-5 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {leads.map((lead) => (
              <tr key={lead.lead_id} className="hover:bg-slate-50">
                <td className="px-5 py-3 font-mono text-xs text-slate-500">{lead.lead_id}</td>
                <td className="px-5 py-3 font-medium text-slate-800">{lead.name}</td>
                <td className="px-5 py-3 font-mono text-xs text-slate-600">{lead.phone}</td>
                <td className="px-5 py-3 font-mono text-xs text-slate-600">{lead.pincode}</td>
                <td className="px-5 py-3 text-slate-700">{lead.dealer_name}</td>
                <td className="px-5 py-3">
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                    {lead.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
