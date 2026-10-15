/**
 * Pure search/filter logic for the Leads page.
 * Kept outside React so tests can cover it without rendering.
 */
import type { Lead, LeadStatus } from './types';

export type StatusFilter = LeadStatus | 'all';
export type DealerFilter = string | 'all'; // dealer_id value, '' = In-house Sales, or 'all'
export type OriginFilter = 'all' | 'migrated' | 'session' | 'cloud';

export interface LeadQuery {
  search: string;
  status: StatusFilter;
  dealer: DealerFilter;
  origin: OriginFilter;
}

export const DEFAULT_LEAD_QUERY: LeadQuery = {
  search: '',
  status: 'all',
  dealer: 'all',
  origin: 'all',
};

/** True when any filter differs from the defaults (used for the "Clear" button). */
export function isDefaultQuery(query: LeadQuery): boolean {
  return (
    query.search.trim() === '' &&
    query.status === 'all' &&
    query.dealer === 'all' &&
    query.origin === 'all'
  );
}

/**
 * Filter leads by free-text search (name, mobile, lead id, pincode,
 * product, dealer) plus status / dealer / origin dropdowns.
 * All filters are combined with AND; an empty search matches everything.
 */
export function filterLeads(leads: Lead[], query: LeadQuery): Lead[] {
  const search = query.search.trim().toLowerCase();
  return leads.filter((lead) => {
    if (query.status !== 'all' && lead.status !== query.status) return false;
    if (query.dealer !== 'all' && lead.dealer_id !== query.dealer) return false;
    if (query.origin !== 'all' && (lead.origin ?? 'migrated') !== query.origin) return false;
    if (search) {
      const haystack = [
        lead.name,
        lead.phone,
        lead.lead_id,
        lead.pincode,
        lead.product,
        lead.dealer_name,
      ]
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });
}
