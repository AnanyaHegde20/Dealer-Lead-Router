/**
 * LeadRepository (Firestore) behaviour against the LOCAL Firestore emulator.
 * Runs only inside `npm run test:emulator`.
 *
 * Uses the REAL firebase/auth + firebase/firestore SDKs (signed-in user,
 * real security rules loaded by the emulator) — the same code path the app
 * uses in production. Unique phone numbers per test keep runs independent
 * since client-side deletes are denied by design.
 */
import { initializeApp, deleteApp, type FirebaseApp } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  signOut as firebaseSignOut,
  type Auth,
} from 'firebase/auth';
import {
  connectFirestoreEmulator,
  doc,
  getDoc,
  getFirestore,
  setDoc,
  type Firestore,
} from 'firebase/firestore';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createFirestoreRepository } from '../firestoreRepository';
import { nextLeadNumberFromIds } from '../leadId';
import { assignDealer } from '../assignDealer';
import { DuplicateMobileError } from '../leadRepository';
import { submitLeadForm } from '../leadForm';
import type { Lead } from '../types';

const host = process.env.FIRESTORE_EMULATOR_HOST;
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;

function buildLead(overrides: Partial<Lead> & { phone: string; pincode: string }): Lead {
  const assignment = assignDealer(overrides.pincode);
  if (!assignment) throw new Error(`bad pincode ${overrides.pincode}`);
  return {
    lead_id: 'PRESET-LEAD-ID',
    name: 'Emulator Lead',
    dealer_id: assignment.dealer_id,
    dealer_name: assignment.dealer_name,
    city: assignment.city,
    product: 'PuREPower Home 5kWh',
    source: 'Website',
    created_on: '2026-10-02',
    status: 'New',
    origin: 'session',
    ...overrides,
  };
}

describe.runIf(Boolean(host && authHost))('createFirestoreRepository (emulator)', () => {
  let app: FirebaseApp;
  let auth: Auth;
  let db: Firestore;

  beforeAll(async () => {
    app = initializeApp({
      apiKey: 'demo-api-key',
      authDomain: 'localhost',
      projectId: 'demo-dealer-router',
      appId: '1:0:0:web:demo',
    });
    auth = getAuth(app);
    const { connectAuthEmulator } = await import('firebase/auth');
    connectAuthEmulator(auth, `http://${authHost}`, { disableWarnings: true });
    db = getFirestore(app);
    const [hostname, portText] = host!.split(':');
    connectFirestoreEmulator(db, hostname, Number(portText));

    // Rules require a signed-in user for every read/write.
    await createUserWithEmailAndPassword(auth, 'repo-emulator@demo.local', 'repo-password-1');
    await new Promise<void>((resolve) => {
      const unsubscribe = onAuthStateChanged(auth, () => {
        unsubscribe();
        resolve();
      });
    });
  }, 30_000);

  afterAll(async () => {
    await firebaseSignOut(auth).catch(() => undefined);
    await deleteApp(app).catch(() => undefined);
  });

  it('creates a lead with an allocated L#### id and finds it by mobile', async () => {
    const repository = createFirestoreRepository(db);
    const before = (await repository.list()).length;

    const lead = buildLead({ phone: '9090000101', pincode: '521137', name: 'Cloud One' });
    await repository.create(lead);

    const found = await repository.findByMobile('9090000101');
    expect(found).not.toBeNull();
    expect(found?.name).toBe('Cloud One');
    expect(found?.origin).toBe('cloud');
    // document id == lead_id field, and it is NOT the local preset id
    expect(found?.lead_id).not.toBe('PRESET-LEAD-ID');
    expect(found?.lead_id).toMatch(/^[A-Za-z0-9_-]{5,20}$/);

    const all = await repository.list();
    expect(all.length).toBe(before + 1);
    expect(all.some((row) => row.phone === '9090000101')).toBe(true);
  });

  it('returns null for an unknown mobile', async () => {
    const repository = createFirestoreRepository(db);
    expect(await repository.findByMobile('9090000199')).toBeNull();
  });

  it('rejects a duplicate mobile at the database level (race-safe)', async () => {
    const repository = createFirestoreRepository(db);
    const first = buildLead({ phone: '9090000102', pincode: '502285', name: 'First Writer' });
    await repository.create(first);

    // Simulate a lost race: the duplicate check above was skipped entirely.
    const second = buildLead({ phone: '9090000102', pincode: '502285', name: 'Second Writer' });
    await expect(repository.create(second)).rejects.toBeInstanceOf(DuplicateMobileError);

    const found = await repository.findByMobile('9090000102');
    expect(found?.name).toBe('First Writer'); // never overwritten
  });

  it('rejects concurrent duplicates from two repositories', async () => {
    const a = createFirestoreRepository(db);
    const b = createFirestoreRepository(db);
    const leadA = buildLead({ phone: '9090000103', pincode: '531001', name: 'Racer A' });
    const leadB = buildLead({ phone: '9090000103', pincode: '531001', name: 'Racer B' });

    const results = await Promise.allSettled([a.create(leadA), b.create(leadB)]);
    const fulfilled = results.filter((entry) => entry.status === 'fulfilled');
    const rejected = results.filter((entry) => entry.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(DuplicateMobileError);

    const survivor = await a.findByMobile('9090000103');
    expect([ 'Racer A', 'Racer B' ]).toContain(survivor?.name);
  });

  it('works through submitLeadForm — validation, assignment and persistence', async () => {
    const repository = createFirestoreRepository(db);

    const rejected = await submitLeadForm(
      { name: 'Dup Person', phone: '9090000101', pincode: '506001', product: 'PuREPower Home 3kWh', source: 'WhatsApp' },
      repository,
    );
    expect(rejected.ok).toBe(false); // findByMobile fast path catches it

    const accepted = await submitLeadForm(
      { name: 'New Person', phone: '9090000104', pincode: '506001', product: 'PuREPower Home 3kWh', source: 'WhatsApp' },
      repository,
    );
    expect(accepted.ok).toBe(true);
    if (!accepted.ok) return;

    const stored = await repository.findByMobile('9090000104');
    expect(stored?.dealer_id).toBe('D03'); // prefix 506
    expect(stored?.dealer_name).toBe('Warangal Green Systems');
    expect(stored?.status).toBe('New');
    expect(stored?.origin).toBe('cloud');
  });

  it('normalises origin: create() always stores cloud — only the migration script writes migrated', async () => {
    const repository = createFirestoreRepository(db);
    const lead = buildLead({
      phone: '9090000105',
      pincode: '505001',
      name: 'Migrated Style',
      origin: 'migrated',
      lead_id: 'MIG-TEST-01',
    });
    await repository.create(lead);
    const found = await repository.findByMobile('9090000105');
    expect(found?.origin).toBe('cloud');
    expect(found?.dealer_id).toBe('D04'); // prefix 505
    // The local preset id is replaced by the Firestore document id
    expect(found?.lead_id).not.toBe('MIG-TEST-01');
  });

  it('updates lead status through the repository (status-only, rules-enforced)', async () => {
    const repository = createFirestoreRepository(db);
    const lead = buildLead({ phone: '9090000106', pincode: '502285', name: 'Status Changer' });
    await repository.create(lead);
    const created = await repository.findByMobile('9090000106');
    expect(created?.status).toBe('New');

    await repository.updateLeadStatus(created!.lead_id, 'Contacted');
    expect((await repository.findByMobile('9090000106'))?.status).toBe('Contacted');

    await repository.updateLeadStatus(created!.lead_id, 'Converted');
    const updated = await repository.findByMobile('9090000106');
    expect(updated?.status).toBe('Converted');
    // only the status column moved
    expect(updated?.phone).toBe('9090000106');
    expect(updated?.dealer_id).toBe('D02');
    expect(updated?.name).toBe('Status Changer');
  });

  it('rejects an unknown status locally and an update of a missing lead', async () => {
    const repository = createFirestoreRepository(db);
    await expect(
      repository.updateLeadStatus('RULES001', 'Pending' as unknown as Lead['status']),
    ).rejects.toThrow(/Invalid lead status/);
    await expect(repository.updateLeadStatus('NO-SUCH-ID', 'Lost')).rejects.toThrow();
  });

  it('allocates sequential business-facing ids in the L#### format', async () => {
    const repository = createFirestoreRepository(db);

    await repository.create(buildLead({ phone: '9090000107', pincode: '502285', name: 'Seq One' }));
    const first = await repository.findByMobile('9090000107');
    expect(first?.lead_id).toMatch(/^L\d{4,}$/);

    await repository.create(buildLead({ phone: '9090000108', pincode: '502285', name: 'Seq Two' }));
    const second = await repository.findByMobile('9090000108');
    expect(second?.lead_id).toMatch(/^L\d{4,}$/);

    // strictly increasing by exactly one
    const firstNumber = Number(first!.lead_id.slice(1));
    const secondNumber = Number(second!.lead_id.slice(1));
    expect(secondNumber).toBe(firstNumber + 1);

    // the Firestore document id equals the business-facing lead_id
    const direct = await getDoc(doc(db, 'leads', second!.lead_id));
    expect(direct.exists()).toBe(true);
    expect((direct.data() as { lead_id: string }).lead_id).toBe(second!.lead_id);
  });

  it('keeps concurrent creates unique and consecutive', async () => {
    const repository = createFirestoreRepository(db);
    const phones = ['9090000109', '9090000110', '9090000111'];

    await Promise.all(
      phones.map((phone, index) =>
        repository.create(buildLead({ phone, pincode: '502285', name: `Concurrent ${index}` })),
      ),
    );

    const leads = await Promise.all(phones.map((phone) => repository.findByMobile(phone)));
    const ids = leads.map((lead) => lead!.lead_id);
    expect(ids.every((id) => /^L\d{4,}$/.test(id))).toBe(true);
    expect(new Set(ids).size).toBe(phones.length); // no duplicates

    const numbers = ids.map((id) => Number(id.slice(1))).sort((a, b) => a - b);
    expect(numbers[1]).toBe(numbers[0] + 1);
    expect(numbers[2]).toBe(numbers[1] + 1);
  });

  it('never re-issues an id that already exists directly in the collection', async () => {
    const repository = createFirestoreRepository(db);

    // Simulate a directly-written lead (e.g. from the migration script)
    // whose number is AT the candidate value: the next create must skip
    // past it instead of colliding.
    const existing = await repository.list();
    const current = nextLeadNumberFromIds(existing.map((l) => l.lead_id));
    const parkedId = `L${current}`; // the very id that would be considered next
    await setDoc(doc(db, 'leads', parkedId), {
      lead_id: parkedId,
      name: 'Parked Legacy',
      phone: '9090000198',
      pincode: '502285',
      dealer_id: 'D02',
      dealer_name: 'Kandi Energy Point',
      city: 'Sangareddy',
      product: 'PuREPower Home 5kWh',
      source: 'Website',
      created_on: '2026-10-01',
      status: 'New',
      origin: 'migrated',
    });

    await repository.create(buildLead({ phone: '9090000112', pincode: '502285', name: 'Skipper' }));
    const created = await repository.findByMobile('9090000112');
    expect(created?.lead_id).not.toBe(parkedId); // collision avoided
    expect(Number(created!.lead_id.slice(1))).toBeGreaterThan(current);
  });
});
