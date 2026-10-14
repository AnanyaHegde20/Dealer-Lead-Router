/**
 * Pure dashboard calculations — every number is computed from the leads
 * that are actually loaded. Nothing here is hardcoded.
 */
import { getDealers } from './assignDealer';
import { IN_HOUSE_SALES, type Lead, type LeadStatus } from './types';

export interface DealerStat {
  dealer_id: string;
  dealer_name: string;
  count: number;
  /** Share of all leads, in percent (0 when there are no leads). */
  share: number;
}

export interface DashboardStats {
  total: number;
  byStatus: Record<LeadStatus, number>;
  /** Every dealer from dealers.json plus the In-house Sales row. */
  dealerStats: DealerStat[];
  inHouse: number;
  migrated: number;
  session: number;
}

/** Percentage of `count` in `total`, rounded to 1 decimal; 0 when total is 0. */
export function percentage(count: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((count / total) * 1000) / 10;
}

/** Compute all dashboard metrics from a list of leads. */
export function computeDashboardStats(leads: Lead[]): DashboardStats {
  const total = leads.length;

  const byStatus: Record<LeadStatus, number> = {
    New: 0,
    Contacted: 0,
    Converted: 0,
    Lost: 0,
  };
  const byDealer = new Map<string, number>();
  let inHouse = 0;
  let migrated = 0;
  let session = 0;

  for (const lead of leads) {
    byStatus[lead.status] = (byStatus[lead.status] ?? 0) + 1;
    if (!lead.dealer_id) {
      inHouse += 1;
    }
    byDealer.set(lead.dealer_id, (byDealer.get(lead.dealer_id) ?? 0) + 1);
    if (lead.origin === 'session') session += 1;
    else migrated += 1;
  }

  const dealerStats: DealerStat[] = getDealers().map((dealer) => ({
    dealer_id: dealer.dealer_id,
    dealer_name: dealer.dealer_name,
    count: byDealer.get(dealer.dealer_id) ?? 0,
    share: 0,
  }));
  dealerStats.push({
    dealer_id: '',
    dealer_name: IN_HOUSE_SALES,
    count: inHouse,
    share: 0,
  });
  for (const stat of dealerStats) {
    stat.share = percentage(stat.count, total);
  }
  dealerStats.sort((a, b) => b.count - a.count || a.dealer_name.localeCompare(b.dealer_name));

  return { total, byStatus, dealerStats, inHouse, migrated, session };
}
