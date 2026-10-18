/**
 * Data-access layer.
 *
 * Combines two sources into one LeadRepository:
 *   1. MIGRATED leads — the 31 cleaned legacy rows from
 *      data-out/cleaned_leads.csv (imported read-only at build time,
 *      the CSV itself is never modified).
 *   2. SESSION leads — new submissions held by the temporary in-memory
 *      repository (cleared on refresh, never written to a server).
 *
 * Migrated rows are NOT copied into the session repository: they are
 * served from a separate immutable list, so duplicate detection compares
 * against both sources while `create()` only ever writes new leads.
 */
import cleanedLeadsCsv from '../../data-out/cleaned_leads.csv?raw';
import { csvToObjects } from './csv';
import { isFirebaseConfigured } from './firebase';
import { createFirestoreRepository } from './firestoreRepository';
import { formatLeadId, nextLeadNumberFromIds } from './leadId';
import { getLeadRepository, type LeadRepository } from './leadRepository';
import type { Lead, LeadStatus } from './types';

const VALID_STATUSES: readonly LeadStatus[] = ['New', 'Contacted', 'Converted', 'Lost'];

/** Parse the cleaned CSV into typed Lead objects (read-only). */
export function loadMigratedLeads(text: string = cleanedLeadsCsv): Lead[] {
  return csvToObjects(text)
    .filter((row) => VALID_STATUSES.includes(row.status as LeadStatus))
    .map((row) => ({
      lead_id: row.lead_id,
      name: row.name,
      phone: row.phone,
      pincode: row.pincode,
      dealer_id: row.dealer_id,
      dealer_name: row.dealer_name,
      city: row.city,
      product: row.product,
      source: row.source,
      created_on: row.created_on,
      status: row.status as LeadStatus,
      origin: 'migrated' as const,
    }));
}

const MIGRATED_LEADS: Lead[] = loadMigratedLeads();

/**
 * Tab-session status overrides for MIGRATED leads (local mode).
 *
 * The bundled rows stay untouched (the CSV is read-only), so a status
 * change to a migrated lead is remembered here instead — module-level so
 * every fresh store instance (getLocalLeadStore() builds one per call)
 * sees it, exactly like session memory. Cleared on page refresh.
 */
const MIGRATED_STATUS_OVERRIDES = new Map<string, LeadStatus>();

/** Drop local-mode migrated status overrides (test helper). */
export function resetLeadStatusOverrides(): void {
  MIGRATED_STATUS_OVERRIDES.clear();
}

/** The immutable migrated dataset (31 cleaned legacy leads). */
export function getMigratedLeads(): Lead[] {
  return MIGRATED_LEADS;
}

/**
 * Combined repository: migrated leads first, then session leads.
 * Duplicate lookup checks migrated rows before session rows.
 * `create` delegates to the session repository only.
 * `updateLeadStatus` writes to the session repository (or the override
 * map when the target is a migrated row, keeping the CSV read-only).
 */
export function createLeadStore(session: LeadRepository): LeadRepository {
  return {
    async list() {
      return [
        ...MIGRATED_LEADS.map((lead) => {
          const status = MIGRATED_STATUS_OVERRIDES.get(lead.lead_id);
          return status && status !== lead.status ? { ...lead, status } : lead;
        }),
        ...(await session.list()),
      ];
    },
    async findByMobile(phone: string) {
      return (
        MIGRATED_LEADS.find((lead) => lead.phone === phone) ??
        (await session.findByMobile(phone))
      );
    },
    async create(lead: Lead) {
      const existing = await session.list();
      const taken = new Set<string>([
        ...MIGRATED_LEADS.map((row) => row.lead_id),
        ...existing.map((row) => row.lead_id),
      ]);
      const reusable = /^L\d+$/.test(lead.lead_id) && !taken.has(lead.lead_id);
      const leadId = reusable ? lead.lead_id : formatLeadId(nextLeadNumberFromIds(taken));
      return session.create({ ...lead, lead_id: leadId, origin: 'session' });
    },
    async updateLeadStatus(id: string, status: LeadStatus) {
      if (MIGRATED_LEADS.some((lead) => lead.lead_id === id)) {
        MIGRATED_STATUS_OVERRIDES.set(id, status);
        return;
      }
      await session.updateLeadStatus(id, status);
    },
  };
}

/**
 * The store the UI uses.
 *
 * Firebase configured  → Cloud Firestore (real cloud data, created via
 *                        scripts/import_legacy_leads.mjs — see
 *                        FIREBASE_SETUP.md). The bundled CSV is NOT merged
 *                        in, so migrated ids can never be double-counted.
 * No Firebase config   → LOCAL mode: bundled migrated CSV + tab memory.
 *                        Clearly labelled in the UI banner.
 */
export function getLeadStore(): LeadRepository {
  if (isFirebaseConfigured) {
    return createFirestoreRepository();
  }
  return getLocalLeadStore();
}

/**
 * Local-only store (bundled CSV + session repository).
 * Tests import this directly so they pass with or without Firebase config.
 */
export function getLocalLeadStore(): LeadRepository {
  return createLeadStore(getLeadRepository());
}
