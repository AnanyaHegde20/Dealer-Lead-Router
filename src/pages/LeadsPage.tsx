import { useMemo, useState } from 'react';
import { EmptyState } from '../components/EmptyState';
import { PageHeader } from '../components/PageHeader';
import { UsersIcon } from '../components/icons';
import {
  DEFAULT_LEAD_QUERY,
  filterLeads,
  isDefaultQuery,
  type DealerFilter,
  type LeadQuery,
  type OriginFilter,
  type StatusFilter,
} from '../lib/leadQuery';
import type { Lead, LeadStatus } from '../lib/types';

interface LeadsPageProps {
  leads: Lead[];
  ready: boolean;
}

const STATUS_CHIP: Record<LeadStatus, string> = {
  New: 'bg-sky-50 text-sky-700 ring-sky-600/20',
  Contacted: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  Converted: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  Lost: 'bg-rose-50 text-rose-700 ring-rose-600/20',
};

const SELECT_CLASSES =
  'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm transition focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200';

/** Distinct dealer options actually present in the data, In-house included. */
function dealerOptions(leads: Lead[]): Array<{ id: string; name: string }> {
  const seen = new Map<string, string>();
  for (const lead of leads) {
    const key = lead.dealer_id;
    if (!seen.has(key)) seen.set(key, lead.dealer_name);
  }
  return [...seen.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Leads table over the combined store: migrated legacy rows plus leads
 * submitted in this session, with search and status/dealer/origin filters.
 */
export function LeadsPage({ leads, ready }: LeadsPageProps) {
  const [query, setQuery] = useState<LeadQuery>(DEFAULT_LEAD_QUERY);

  const options = useMemo(() => dealerOptions(leads), [leads]);
  const visible = useMemo(() => filterLeads(leads, query), [leads, query]);
  const sessionCount = leads.filter((lead) => lead.origin === 'session').length;

  function update<K extends keyof LeadQuery>(key: K, value: LeadQuery[K]) {
    setQuery((previous) => ({ ...previous, [key]: value }));
  }

  if (!ready) {
    return (
      <div className="space-y-6">
        <PageHeader title="Leads" subtitle="All customer leads with their assigned dealer" />
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-500 shadow-sm">
          Loading leads…
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Leads"
        subtitle={`${leads.length} lead${leads.length === 1 ? '' : 's'} — migrated legacy data and this session`}
      />

      {sessionCount > 0 ? (
        <p
          role="status"
          className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800"
        >
          {sessionCount} lead{sessionCount === 1 ? '' : 's'} on this page were submitted in this
          browser session and live in temporary memory only — they disappear on refresh and have
          not been sent to any server.
        </p>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <div className="min-w-0 flex-1">
            <label
              htmlFor="lead-search"
              className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500"
            >
              Search
            </label>
            <input
              id="lead-search"
              type="search"
              value={query.search}
              onChange={(event) => update('search', event.target.value)}
              placeholder="Name, mobile, lead id, pincode, product or dealer…"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm transition placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:w-auto">
            <div>
              <label
                htmlFor="filter-status"
                className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500"
              >
                Status
              </label>
              <select
                id="filter-status"
                value={query.status}
                onChange={(event) => update('status', event.target.value as StatusFilter)}
                className={`${SELECT_CLASSES} w-full lg:w-36`}
              >
                <option value="all">All statuses</option>
                <option value="New">New</option>
                <option value="Contacted">Contacted</option>
                <option value="Converted">Converted</option>
                <option value="Lost">Lost</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="filter-dealer"
                className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500"
              >
                Dealer
              </label>
              <select
                id="filter-dealer"
                value={query.dealer}
                onChange={(event) => update('dealer', event.target.value as DealerFilter)}
                className={`${SELECT_CLASSES} w-full lg:w-44`}
              >
                <option value="all">All dealers</option>
                {options.map((option) => (
                  <option key={option.id || 'inhouse'} value={option.id}>
                    {option.id ? `${option.id} · ${option.name}` : option.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="filter-origin"
                className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500"
              >
                Record
              </label>
              <select
                id="filter-origin"
                value={query.origin}
                onChange={(event) => update('origin', event.target.value as OriginFilter)}
                className={`${SELECT_CLASSES} w-full lg:w-36`}
              >
                <option value="all">All records</option>
                <option value="migrated">Migrated</option>
                <option value="session">Session</option>
              </select>
            </div>
          </div>

          {!isDefaultQuery(query) ? (
            <button
              type="button"
              onClick={() => setQuery(DEFAULT_LEAD_QUERY)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-200"
            >
              Clear filters
            </button>
          ) : null}
        </div>

        <p className="mt-3 text-xs text-slate-500" aria-live="polite">
          Showing {visible.length} of {leads.length} leads
        </p>
      </section>

      {visible.length === 0 ? (
        <EmptyState
          icon={<UsersIcon className="h-6 w-6" />}
          title="No leads match your filters"
          description="Try a different search term, or clear the filters to see every lead again."
        />
      ) : (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">Lead</th>
                  <th scope="col" className="px-4 py-3 font-medium">Customer</th>
                  <th scope="col" className="px-4 py-3 font-medium">Mobile</th>
                  <th scope="col" className="px-4 py-3 font-medium">Pincode</th>
                  <th scope="col" className="hidden px-4 py-3 font-medium md:table-cell">Product</th>
                  <th scope="col" className="hidden px-4 py-3 font-medium lg:table-cell">Source</th>
                  <th scope="col" className="px-4 py-3 font-medium">Status</th>
                  <th scope="col" className="px-4 py-3 font-medium">Dealer</th>
                  <th scope="col" className="px-4 py-3 font-medium">Record</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visible.map((lead) => (
                  <tr key={`${lead.origin ?? 'migrated'}-${lead.lead_id}`} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{lead.lead_id}</td>
                    <td className="px-4 py-3 font-medium text-slate-800">{lead.name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">{lead.phone}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">{lead.pincode}</td>
                    <td className="hidden px-4 py-3 text-slate-600 md:table-cell">{lead.product}</td>
                    <td className="hidden px-4 py-3 text-slate-600 lg:table-cell">{lead.source}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_CHIP[lead.status]}`}
                      >
                        {lead.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {lead.dealer_id ? (
                        <span className="text-slate-700">
                          <span className="font-mono text-xs text-slate-400">{lead.dealer_id} </span>
                          {lead.dealer_name}
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20">
                          {lead.dealer_name}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        title={
                          lead.origin === 'session'
                            ? 'Submitted in this tab — temporary memory only'
                            : 'Migrated from data-out/cleaned_leads.csv'
                        }
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
                          lead.origin === 'session'
                            ? 'bg-indigo-50 text-indigo-700 ring-indigo-600/20'
                            : 'bg-slate-100 text-slate-600 ring-slate-500/20'
                        }`}
                      >
                        {lead.origin === 'session' ? 'Session' : 'Migrated'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
