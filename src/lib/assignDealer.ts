/**
 * Dealer routing — the core business rule of the assignment:
 *   valid pincode -> first three digits -> dealer from data-out/dealers.json
 *   valid pincode with no matching prefix -> "In-house Sales"
 *   INVALID pincode -> null (never assigned to anyone)
 *
 * The mapping is imported from data-out/dealers.json, so the app and the Python
 * script can never disagree about which dealer owns which prefix.
 */
import dealersJson from '../../data-out/dealers.json';
import { IN_HOUSE_SALES, type Dealer, type DealerAssignment, type DealerLookup, type DealerRef } from './types';
import { PINCODE_REGEX } from './validate';

const lookup = dealersJson as DealerLookup;

/** The whole dealers.json document (source of truth for routing). */
export function getDealerLookup(): DealerLookup {
  return lookup;
}

/** All 8 dealers from data/dealers.csv, pre-processed by scripts/clean_legacy_leads.py. */
export function getDealers(): Dealer[] {
  return lookup.dealers;
}

/** prefix (e.g. "530") -> dealer identity. */
export function getPrefixMap(): Record<string, DealerRef> {
  return lookup.prefix_map;
}

/**
 * Route one pincode.
 *
 * @returns null                       if the pincode is invalid (no assignment!)
 * @returns DealerAssignment(matched)  if a dealer owns the 3-digit prefix
 * @returns DealerAssignment(In-house Sales, matched: false) if the pincode is
 *         valid but no dealer owns the prefix (e.g. 110001 -> Delhi)
 */
export function assignDealer(
  pincode: string,
  prefixMap: Record<string, DealerRef> = lookup.prefix_map,
): DealerAssignment | null {
  const value = (pincode ?? '').trim();
  if (!PINCODE_REGEX.test(value)) {
    return null;
  }
  const dealer = prefixMap[value.slice(0, 3)];
  if (!dealer) {
    return { dealer_id: '', dealer_name: IN_HOUSE_SALES, city: '', matched: false };
  }
  return {
    dealer_id: dealer.dealer_id,
    dealer_name: dealer.dealer_name,
    city: dealer.city,
    matched: true,
  };
}
