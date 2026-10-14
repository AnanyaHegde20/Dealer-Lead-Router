/**
 * Lead persistence boundary.
 *
 * Phase 3 (NOW): an in-memory store lives in the browser tab only.
 *   - Nothing is sent to a server.
 *   - Refreshing the page clears it. It holds ONLY leads the user submits
 *     in this session — it is never seeded with sample data.
 *
 * Phase 5 (LATER): implement the same `LeadRepository` interface with Cloud
 * Firestore and install it via `setLeadRepository(firestoreRepository)`.
 * The form and its duplicate check will not need to change at all, because
 * they only ever talk to this interface.
 */
import type { Lead } from './types';

export interface LeadRepository {
  /** All stored leads. */
  list(): Promise<Lead[]>;
  /** Find a lead by its NORMALIZED 10-digit mobile (duplicate check). */
  findByMobile(phone: string): Promise<Lead | null>;
  /** Persist a new lead. */
  create(lead: Lead): Promise<void>;
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
    async create(lead: Lead) {
      rows.push({ ...lead });
    },
  };
}

let activeRepository: LeadRepository = createMemoryLeadRepository();

/** The repository the form currently uses (memory until Phase 5). */
export function getLeadRepository(): LeadRepository {
  return activeRepository;
}

/** Swap the storage backend — this is the single change Firestore needs later. */
export function setLeadRepository(repository: LeadRepository): void {
  activeRepository = repository;
}

/** Restore a fresh empty in-memory store (used by tests). */
export function resetLeadRepository(): void {
  activeRepository = createMemoryLeadRepository();
}
