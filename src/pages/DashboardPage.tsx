import { DealerRoster } from '../components/DealerRoster';
import { EmptyState } from '../components/EmptyState';
import { PageHeader } from '../components/PageHeader';
import { StatCard } from '../components/StatCard';
import { ChartIcon } from '../components/icons';
import { computeDashboardStats, percentage } from '../lib/leadStats';
import type { Lead, LeadStatus } from '../lib/types';

interface DashboardPageProps {
  leads: Lead[];
  ready: boolean;
}

const STATUS_ORDER: LeadStatus[] = ['New', 'Contacted', 'Converted', 'Lost'];

const STATUS_BAR: Record<LeadStatus, string> = {
  New: 'bg-sky-500',
  Contacted: 'bg-amber-500',
  Converted: 'bg-emerald-500',
  Lost: 'bg-rose-500',
};

/**
 * Dashboard with metrics computed from the combined store
 * (31 migrated legacy leads + leads submitted this session).
 * Every number is derived — none are hardcoded.
 */
export function DashboardPage({ leads, ready }: DashboardPageProps) {
  const stats = computeDashboardStats(leads);

  if (!ready) {
    return (
      <div className="space-y-6">
        <PageHeader title="Dashboard" subtitle="Lead counts by dealer and by status" />
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-500 shadow-sm">
          Loading leads…
        </div>
      </div>
    );
  }

  if (stats.total === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title="Dashboard" subtitle="Lead counts by dealer and by status" />
        <EmptyState
          icon={<ChartIcon className="h-6 w-6" />}
          title="No lead data yet"
          description="Counts by dealer and by status will appear as soon as leads are available. This build never shows made-up numbers."
        />
        <DealerRoster />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" subtitle="Lead counts by dealer and by status" />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total leads"
          value={stats.total}
          caption="Migrated legacy + this session"
        />
        <StatCard
          label="Migrated leads"
          value={stats.migrated}
          caption="From data-out/cleaned_leads.csv"
          tone="sky"
        />
        <StatCard
          label="Session leads"
          value={stats.session}
          caption={
            stats.session > 0
              ? 'Temporary browser memory — refresh clears them'
              : 'None submitted in this tab yet'
          }
          tone={stats.session > 0 ? 'amber' : 'default'}
        />
        <StatCard
          label="In-house Sales"
          value={stats.inHouse}
          caption="Valid pincode, no matching dealer"
          tone="emerald"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">Leads by status</h2>
          <p className="mt-0.5 text-xs text-slate-500">Share of all {stats.total} leads.</p>
          <ul className="mt-4 space-y-4">
            {STATUS_ORDER.map((status) => {
              const count = stats.byStatus[status];
              const share = percentage(count, stats.total);
              return (
                <li key={status}>
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="font-medium text-slate-700">{status}</span>
                    <span className="tabular-nums text-slate-600">
                      {count}{' '}
                      <span className="text-xs text-slate-400">({share}%)</span>
                    </span>
                  </div>
                  <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full rounded-full ${STATUS_BAR[status]}`}
                      style={{ width: `${share}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">Leads by dealer</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            First three pincode digits decide the dealer; the rest go to In-house Sales.
          </p>
          <ul className="mt-4 space-y-4">
            {stats.dealerStats.map((dealer) => (
              <li key={dealer.dealer_id || 'inhouse'}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="flex min-w-0 items-baseline gap-2">
                    <span
                      className={`shrink-0 font-mono text-xs ${
                        dealer.dealer_id ? 'text-slate-400' : 'text-amber-500'
                      }`}
                    >
                      {dealer.dealer_id || 'IN-HOUSE'}
                    </span>
                    <span
                      className={`truncate font-medium ${
                        dealer.dealer_id ? 'text-slate-700' : 'text-amber-700'
                      }`}
                    >
                      {dealer.dealer_name}
                    </span>
                  </span>
                  <span className="shrink-0 tabular-nums text-slate-600">
                    {dealer.count}{' '}
                    <span className="text-xs text-slate-400">({dealer.share}%)</span>
                  </span>
                </div>
                <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full rounded-full ${
                      dealer.dealer_id ? 'bg-emerald-500' : 'bg-amber-500'
                    }`}
                    style={{ width: `${dealer.share}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {stats.session > 0 ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
          {stats.session} lead{stats.session === 1 ? ' is' : 's are'} stored in temporary browser
          memory only and will disappear on refresh. Nothing has been saved to a server — Cloud
          Firestore arrives in Phase 5.
        </p>
      ) : null}

      <DealerRoster />
    </div>
  );
}
