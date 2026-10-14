/**
 * Domain types for the Dealer Lead Router.
 *
 * Every interface mirrors the real column layout of the assignment files:
 *   data/legacy_leads.csv  -> LegacyLeadRow / Lead
 *   data/dealers.csv       -> DealerCsvRow
 *   data-out/dealers.json  -> Dealer / DealerLookup
 */

/** Fallback route when a valid pincode matches no dealer prefix. */
export const IN_HOUSE_SALES = 'In-house Sales';

/** Status vocabulary produced by the Phase 1 cleaning script. */
export type LeadStatus = 'New' | 'Contacted' | 'Converted' | 'Lost';

/** Source vocabulary produced by the Phase 1 cleaning script. */
export type LeadSource = 'Website' | 'Voice Agent' | 'Dealer Walk-in' | 'WhatsApp';

/** Exact columns of data/legacy_leads.csv, before cleaning. */
export interface LegacyLeadRow {
  lead_id: string;
  name: string;
  phone: string;
  pincode: string;
  product: string;
  source: string;
  created_on: string;
  status: string;
}

/** A cleaned, dealer-assigned lead (same shape as data-out/cleaned_leads.csv). */
export interface Lead {
  lead_id: string;
  name: string;
  /** Normalized mobile: exactly 10 digits starting with 6/7/8/9. */
  phone: string;
  /** Exactly 6 digits; invalid pincodes never reach this type. */
  pincode: string;
  /** Empty when routed to In-house Sales. */
  dealer_id: string;
  /** Dealer name, or "In-house Sales" for the fallback route. */
  dealer_name: string;
  city: string;
  product: string;
  source: string;
  /** ISO date, YYYY-MM-DD. */
  created_on: string;
  status: LeadStatus;
}

/** Raw row of data/dealers.csv — pincode_prefixes is pipe-separated ("530|531"). */
export interface DealerCsvRow {
  dealer_id: string;
  dealer_name: string;
  city: string;
  pincode_prefixes: string;
  contact_email: string;
}

/** Dealer as written by Phase 1 into data-out/dealers.json (prefixes split into an array). */
export interface Dealer {
  dealer_id: string;
  dealer_name: string;
  city: string;
  pincode_prefixes: string[];
  contact_email: string;
}

/** One entry of dealers.json prefix_map: 3-digit prefix -> dealer identity. */
export interface DealerRef {
  dealer_id: string;
  dealer_name: string;
  city: string;
}

/** Full shape of data-out/dealers.json. */
export interface DealerLookup {
  source: string;
  generated_at_utc: string;
  dealers: Dealer[];
  prefix_map: Record<string, DealerRef>;
}

/** Result of routing one pincode. `matched: false` means In-house Sales. */
export interface DealerAssignment {
  dealer_id: string;
  dealer_name: string;
  city: string;
  matched: boolean;
}

/** Reusable result type for validators: either a cleaned value or an error message. */
export type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string };
