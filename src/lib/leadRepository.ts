/**
 * Lead persistence boundary.
 *
 * Backends behind this interface:
 *   - tab memory (local mode / tests): never sent to a server, cleared on refresh
 *   - Cloud Firestore (configured): see firestoreRepository.ts
 * The form and its duplicate check only ever talk to this interface.
 */
import { formatLeadId, nextLeadNumberFromIds } from './leadId';
import type { Lead, LeadStatus } from './types';

export interface LeadRepository {
  /** All stored leads. */
  list(): Promise<Lead[]>;
  /** Find a lead by its NORMALIZED 10-digit mobile (duplicate check). */
  findByMobile(phone: string): Promise<Lead | null>;
  /**
   * Persist a new lead and return the STORED row. The repository owns the
   * business-facing L#### id: the incoming lead_id is treated as a
   * provisional hint and replaced when it is empty or already taken, so
   * every backend hands out unique ids.
   */
  create(lead: Lead): Promise<Lead>;
  /** Change the status of an existing lead — the only editable field. */
  updateLeadStatus(id: string, status: LeadStatus): Promise<void>;
}

/**
 * Thrown when a normalized mobile number is already taken.
 *
 * `holder` is the lead_id of the existing record when known (Firestore
 * phoneIndex provides it), enabling a specific error message instead of a
 * generic one. Duplicates are enforced at the database level (transactional
 * phoneIndex write), not merely by a client-side query.
 */
export class DuplicateMobileError extends Error {
  readonly phone: string;
  readonly holder?: string;

  constructor(phone: string, holder?: string) {
    super(
      holder
        ? `This mobile number is already registered to lead ${holder}.`
        : 'This mobile number is already registered.',
    );
    this.name = 'DuplicateMobileError';
    this.phone = phone;
    this.holder = holder;
  }
}

/** Temporary tab-memory implementation. Empty on every page load. */
export function createMemoryLeadRepository(seed: Lead[] = []): LeadRepository {
  const rows: Lead[] = [...seed];
  return {
    async list() {
      return [...rows];
    },
    async findByMobile(phone: string) {
      return rows.find((lead) => lead.phone === phone) ?? null;
    },
    async create(lead: Lead): Promise<Lead> {
      // The caller's lead_id is provisional: keep it only when it is a
      // valid L#### id that is still free, otherwise allocate the next
      // free number so ids stay unique and in the business format.
      const taken = new Set(rows.map((row) => row.lead_id));
      const provisional = lead.lead_id;
      const reusable =
        /^L\d+$/.test(provisional) && !taken.has(provisional);
      const leadId = reusable ? provisional : formatLeadId(nextLeadNumberFromIds(taken));
      const stored: Lead = { ...lead, lead_id: leadId };
      rows.push(stored);
      return stored;
    },
    async updateLeadStatus(id: string, status: LeadStatus) {
      const row = rows.find((lead) => lead.lead_id === id);
      if (!row) throw new Error(`Lead ${id} not found`);
      row.status = status;
    },
  };
}

let activeRepository: LeadRepository = createMemoryLeadRepository();

/** The repository behind getLeadStore() (memory in local mode; tests can swap it). */
export function getLeadRepository(): LeadRepository {
  return activeRepository;
}

/** Swap the storage backend. */
export function setLeadRepository(repository: LeadRepository): void {
  activeRepository = repository;
}

/** Restore a fresh empty in-memory store (used by tests). */
export function resetLeadRepository(): void {
  activeRepository = createMemoryLeadRepository();
}
