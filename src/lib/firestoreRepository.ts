/**
 * Firestore implementation of the LeadRepository interface.
 *
 * Collections:
 *   leads/{leadId}          — one document per lead (exact field set)
 *   phoneIndex/{normalized} — append-only ledger giving ONE lead per mobile
 *
 * Duplicate handling & concurrency:
 *   findByMobile() is a fast path that gives a nice error message, but it is
 *   NOT the guarantee. create() runs a Firestore transaction that reads
 *   phoneIndex/{phone} and writes lead + index atomically; Firestore
 *   re-runs the transaction when another client writes concurrently, so a
 *   duplicate insert fails at the database level even under race
 *   conditions. That is what lets us claim DB-enforced uniqueness for
 *   cloud mode (the security rules make the index append-only too).
 *
 * New leads receive a Firestore auto-id as their lead_id (document id ==
 * lead_id field, required by firestore.rules). The migration script uses
 * the stable legacy ids (L1001…) as document ids.
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  runTransaction,
  type Firestore,
} from 'firebase/firestore';
import { getFirebaseDb } from './firebase';
import { DuplicateMobileError, type LeadRepository } from './leadRepository';
import type { Lead, LeadStatus } from './types';

const LEAD_STATUSES: readonly LeadStatus[] = ['New', 'Contacted', 'Converted', 'Lost'];

/** Fields stored in a leads document — mirrors firestore.rules exactly. */
export interface LeadDoc {
  lead_id: string;
  name: string;
  phone: string;
  pincode: string;
  dealer_id: string;
  dealer_name: string;
  city: string;
  product: string;
  source: string;
  created_on: string;
  status: string;
  origin: 'migrated' | 'cloud';
}

export const LEAD_DOC_KEYS: ReadonlyArray<keyof LeadDoc> = [
  'lead_id',
  'name',
  'phone',
  'pincode',
  'dealer_id',
  'dealer_name',
  'city',
  'product',
  'source',
  'created_on',
  'status',
  'origin',
];

/**
 * Convert a Lead into the exact document shape the security rules accept.
 * Session-only leads become 'cloud' records; only migration data keeps
 * origin 'migrated'.
 */
export function leadToDoc(lead: Lead): LeadDoc {
  return {
    lead_id: lead.lead_id,
    name: lead.name,
    phone: lead.phone,
    pincode: lead.pincode,
    dealer_id: lead.dealer_id,
    dealer_name: lead.dealer_name,
    city: lead.city,
    product: lead.product,
    source: lead.source,
    created_on: lead.created_on,
    status: lead.status,
    origin: lead.origin === 'migrated' ? 'migrated' : 'cloud',
  };
}

/** Parse and validate a leads document. Throws on malformed data. */
export function docToLead(id: string, data: unknown): Lead {
  if (typeof data !== 'object' || data === null) {
    throw new Error(`Malformed lead document ${id}`);
  }
  const raw = data as Record<string, unknown>;
  const required = ['lead_id', 'name', 'phone', 'pincode', 'dealer_id', 'dealer_name', 'city', 'product', 'source', 'created_on', 'status'];
  for (const key of required) {
    if (typeof raw[key] !== 'string') {
      throw new Error(`Lead ${id}: field "${key}" must be a string`);
    }
  }
  const status = raw.status as LeadStatus;
  if (!LEAD_STATUSES.includes(status)) {
    throw new Error(`Lead ${id}: unknown status ${String(raw.status)}`);
  }
  return {
    lead_id: raw.lead_id as string,
    name: raw.name as string,
    phone: raw.phone as string,
    pincode: raw.pincode as string,
    dealer_id: raw.dealer_id as string,
    dealer_name: raw.dealer_name as string,
    city: raw.city as string,
    product: raw.product as string,
    source: raw.source as string,
    created_on: raw.created_on as string,
    status,
    origin: raw.origin === 'migrated' ? 'migrated' : 'cloud',
  };
}

/** Repository bound to a Firestore instance (injectable for emulator tests). */
export function createFirestoreRepository(db: Firestore = getFirebaseDb()): LeadRepository {
  return {
    async list(): Promise<Lead[]> {
      const snapshot = await getDocs(collection(db, 'leads'));
      const leads = snapshot.docs.map((entry) => docToLead(entry.id, entry.data()));
      leads.sort((a, b) => b.created_on.localeCompare(a.created_on) || a.lead_id.localeCompare(b.lead_id));
      return leads;
    },

    async findByMobile(phone: string): Promise<Lead | null> {
      const indexRef = doc(db, 'phoneIndex', phone);
      const indexSnap = await getDoc(indexRef);
      if (!indexSnap.exists()) return null;
      const leadId = String((indexSnap.data() as { lead_id?: unknown }).lead_id ?? '');
      if (!leadId) return null;
      const leadSnap = await getDoc(doc(db, 'leads', leadId));
      return leadSnap.exists() ? docToLead(leadSnap.id, leadSnap.data()) : null;
    },

    async create(lead: Lead): Promise<void> {
      const leadRef = doc(collection(db, 'leads'));
      const document = leadToDoc({ ...lead, lead_id: leadRef.id, origin: 'cloud' });
      const indexRef = doc(db, 'phoneIndex', document.phone);

      try {
        await runTransaction(db, async (transaction) => {
          const [indexSnap, leadSnap] = [
            await transaction.get(indexRef),
            await transaction.get(leadRef),
          ];
          if (indexSnap.exists()) {
            const holder = String((indexSnap.data() as { lead_id?: unknown }).lead_id ?? '');
            throw new DuplicateMobileError(document.phone, holder);
          }
          if (leadSnap.exists()) {
            throw new Error(`Lead id ${leadRef.id} already exists`);
          }
          transaction.set(indexRef, { phone: document.phone, lead_id: document.lead_id });
          transaction.set(leadRef, document);
        });
      } catch (error) {
        if (error instanceof DuplicateMobileError) throw error;
        // Firestore surfaces aborted transactions as failed-precondition;
        // treat a lost race on the index the same way as a duplicate.
        const code = (error as { code?: string }).code ?? '';
        if (code === 'failed-precondition' || code === 'aborted') {
          throw new DuplicateMobileError(document.phone);
        }
        throw error;
      }
    },
  };
}
