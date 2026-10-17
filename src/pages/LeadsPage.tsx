import { useEffect, useMemo, useState } from 'react';
import { EmptyState } from '../components/EmptyState';
import { PageHeader } from '../components/PageHeader';
import { UsersIcon } from '../components/icons';
import { getLeadStore } from '../lib/leadData';
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
  /** Bubbles up so Dashboard/Leads re-read the store after a status change. */
  onLeadUpdated?: () => void;
}

/** The four statuses a lead may be moved to (matches firestore.rules). */
const STATUS_OPTIONS: readonly LeadStatus[] = ['New', 'Contacted', 'Converted', 'Lost'];

const SELECT_CLASSES =
  'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm transition focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200';

/** Compact variant for the per-row status dropdown. */
const ROW_SELECT_CLASSES =
  'w-32 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200 disabled:cursor-not-allowed disabled:opacity-60';

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
export function LeadsPage({ leads, ready, onLeadUpdated }: LeadsPageProps) {
  const [query, setQuery] = useState<LeadQuery>(DEFAULT_LEAD_QUERY);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  // Optimistic value shown while the save is in flight; dropped as soon as
  // the refreshed store catches up (or immediately when the save fails).
  const [pendingStatus, setPendingStatus] = useState<Map<string, LeadStatus>>(new Map());

  const options = useMemo(() => dealerOptions(leads), [leads]);
  const visible = useMemo(() => filterLeads(leads, query), [leads, query]);
  const sessionCount = leads.filter((lead) => lead.origin === 'session').length;

  useEffect(() => {
    setPendingStatus((previous) => {
      if (previous.size === 0) return previous;
      const next = new Map(previous);
      let settled = false;
      for (const [id, status] of previous) {
        if (leads.find((lead) => lead.lead_id === id)?.status === status) {
          next.delete(id);
          settled = true;
        }
      }
      return settled ? next : previous;
    });
  }, [leads]);

  function update<K extends keyof LeadQuery>(key: K, value: LeadQuery[K]) {
    setQuery((previous) => ({ ...previous, [key]: value }));
  }

  async function changeStatus(lead: Lead, status: LeadStatus) {
    if (status === lead.status) return;
    setSavingId(lead.lead_id);
    setStatusError(null);
    setPendingStatus((previous) => new Map(previous).set(lead.lead_id, status));
    try {
      await getLeadStore().updateLeadStatus(lead.lead_id, status);
      onLeadUpdated?.(); // Dashboard counts + filters re-read the store
    } catch (error) {
      console.error('[LeadsPage] status update failed', error);
      setPendingStatus((previous) => {
        const next = new Map(previous);
        next.delete(lead.lead_id); // revert the optimistic value
        return next;
      });
      setStatusError(
        `Could not update status for ${lead.lead_id}: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    } finally {
      setSavingId(null);
    }
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
                <option value="cloud">Cloud</option>
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

      {statusError ? (
        <p
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700"
        >
          {statusError}
        </p>
      ) : null}

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
                      <select
                        className={ROW_SELECT_CLASSES}
                        value={pendingStatus.get(lead.lead_id) ?? lead.status}
                        disabled={savingId !== null}
                        aria-label={`Status for lead ${lead.lead_id}`}
                        onChange={(event) => {
                          void changeStatus(lead, event.target.value as LeadStatus);
                        }}
                      >
                        {STATUS_OPTIONS.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                      {savingId === lead.lead_id ? (
                        <span role="status" className="mt-1 block text-[11px] text-slate-400">
                          Saving…
                        </span>
                      ) : null}
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
                            : lead.origin === 'cloud'
                              ? 'Stored in Cloud Firestore'
                              : 'Migrated from data-out/cleaned_leads.csv'
                        }
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
                          lead.origin === 'session'
                            ? 'bg-indigo-50 text-indigo-700 ring-indigo-600/20'
                            : lead.origin === 'cloud'
                              ? 'bg-teal-50 text-teal-700 ring-teal-600/20'
                              : 'bg-slate-100 text-slate-600 ring-slate-500/20'
                        }`}
                      >
                        {lead.origin === 'session'
                          ? 'Session'
                          : lead.origin === 'cloud'
                            ? 'Cloud'
                            : 'Migrated'}
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
