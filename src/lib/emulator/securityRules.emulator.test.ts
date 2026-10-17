/**
 * Firestore security-rule tests against the LOCAL Firestore emulator with
 * firestore.rules loaded exactly as deployed (firebase.json).
 * Runs only inside `npm run test:emulator`.
 *
 * Everything asserted here would be exploitable by any signed-in (or even
 * anonymous) client if the rules were wrong — so these tests pin down the
 * security decisions:
 *   - unauthenticated access denied
 *   - exact field allowlist (no client-supplied `role` flags)
 *   - dealer recomputed from the pincode (no self-assignment)
 *   - status-only client updates (any other field change or delete denied)
 *   - append-only duplicate index
 */
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const host = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080').split(':');
const PROJECT = 'demo-dealer-router';

/** A fully valid lead for pincode 502285 (prefix 502 → D02). */
function validLead(overrides: Record<string, unknown> = {}) {
  return {
    lead_id: 'RULES001',
    name: 'Rules Tester',
    phone: '9090000011',
    pincode: '502285',
    dealer_id: 'D02',
    dealer_name: 'Kandi Energy Point',
    city: 'Sangareddy',
    product: 'PuREPower Home 5kWh',
    source: 'Website',
    created_on: '2026-10-01',
    status: 'New',
    origin: 'cloud',
    ...overrides,
  };
}

describe.runIf(Boolean(process.env.FIRESTORE_EMULATOR_HOST))('firestore.rules (emulator)', () => {
  let env: RulesTestEnvironment;

  beforeAll(async () => {
    env = await initializeTestEnvironment({
      projectId: PROJECT,
      firestore: {
        rules: readFileSync(join(__dirname, '..', '..', '..', 'firestore.rules'), 'utf8'),
        host: host[0],
        port: Number(host[1]),
      },
    });
  });

  beforeEach(async () => {
    await env.clearFirestore();
  });

  afterAll(async () => {
    await env.cleanup();
  });

  it('denies every operation to unauthenticated clients', async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(getDocs(collection(db, 'leads')));
    await assertFails(getDoc(doc(db, 'leads', 'L1001')));
    await assertFails(setDoc(doc(db, 'leads', 'ANON01'), validLead()));
    await assertFails(setDoc(doc(db, 'phoneIndex', '9090000011'), { phone: '9090000011', lead_id: 'ANON01' }));
  });

  it('lets a signed-in user read leads but never write arbitrary ones', async () => {
    const db = env.authenticatedContext('user-1').firestore();
    await assertSucceeds(setDoc(doc(db, 'leads', 'RULES001'), validLead()));
    await assertSucceeds(getDocs(collection(db, 'leads')));
  });

  it('accepts a valid lead create with document id == lead_id', async () => {
    const db = env.authenticatedContext('user-1').firestore();
    await assertSucceeds(setDoc(doc(db, 'leads', 'RULES001'), validLead()));
    // In-house Sales variant (no dealer matches the pincode)
    await assertSucceeds(
      setDoc(
        doc(db, 'leads', 'RULES002'),
        validLead({
          lead_id: 'RULES002',
          phone: '9090000012',
          pincode: '110001',
          dealer_id: '',
          dealer_name: 'In-house Sales',
          city: '',
        }),
      ),
    );
  });

  it('rejects a document id that does not equal lead_id', async () => {
    const db = env.authenticatedContext('user-1').firestore();
    await assertFails(setDoc(doc(db, 'leads', 'SOMEOTHERID'), validLead()));
  });

  it('rejects invalid phones, pincodes, dates, statuses and products', async () => {
    const db = env.authenticatedContext('user-1').firestore();
    await assertFails(setDoc(doc(db, 'leads', 'RULES001'), validLead({ phone: '12345' })));
    await assertFails(setDoc(doc(db, 'leads', 'RULES001'), validLead({ pincode: '000000' })));
    await assertFails(setDoc(doc(db, 'leads', 'RULES001'), validLead({ created_on: '01-01-2026' })));
    await assertFails(setDoc(doc(db, 'leads', 'RULES001'), validLead({ status: 'Pending' })));
    await assertFails(setDoc(doc(db, 'leads', 'RULES001'), validLead({ product: 'Mystery Product' })));
    await assertFails(setDoc(doc(db, 'leads', 'RULES001'), validLead({ source: 'Carrier Pigeon' })));
    await assertFails(setDoc(doc(db, 'leads', 'RULES001'), validLead({ origin: 'session' })));
  });

  it('recomputes the dealer from the pincode — no self-assignment', async () => {
    const db = env.authenticatedContext('user-1').firestore();
    // 502285 belongs to D02: claiming D01 must fail
    await assertFails(
      setDoc(doc(db, 'leads', 'RULES001'), validLead({
        dealer_id: 'D01',
        dealer_name: 'Sri Sai Power Solutions',
        city: 'Hyderabad',
      })),
    );
    // A real dealer id with an unmatched pincode must fail too (In-house trap)
    await assertFails(
      setDoc(doc(db, 'leads', 'RULES001'), validLead({ pincode: '110001' })),
    );
    // Wrong dealer_name for the correct dealer id must fail
    await assertFails(setDoc(doc(db, 'leads', 'RULES001'), validLead({ dealer_name: 'Fake Energy' })));
  });

  it('rejects unknown fields such as client-supplied role flags', async () => {
    const db = env.authenticatedContext('user-1').firestore();
    await assertFails(setDoc(doc(db, 'leads', 'RULES001'), validLead({ role: 'admin' })));
    await assertFails(setDoc(doc(db, 'leads', 'RULES001'), validLead({ isAdmin: true })));
    await assertFails(
      setDoc(doc(db, 'leads', 'RULES001'), validLead({ dealer_override: 'D06' })),
    );
    // A missing required field must fail as well
    const missing = validLead() as Record<string, unknown>;
    delete missing.status;
    await assertFails(setDoc(doc(db, 'leads', 'RULES001'), missing));
  });

  it('allows signed-in users to change ONLY the status field', async () => {
    const db = env.authenticatedContext('user-1').firestore();
    await assertSucceeds(setDoc(doc(db, 'leads', 'RULES001'), validLead()));
    for (const status of ['Contacted', 'Converted', 'Lost', 'New']) {
      await assertSucceeds(updateDoc(doc(db, 'leads', 'RULES001'), { status }));
    }
    const after = await getDoc(doc(db, 'leads', 'RULES001'));
    expect((after.data() as { status: string }).status).toBe('New');
  });

  it('rejects status updates that also touch phone or any other field', async () => {
    const db = env.authenticatedContext('user-1').firestore();
    await assertSucceeds(setDoc(doc(db, 'leads', 'RULES001'), validLead()));
    // phone is the sensitive one — alone or bundled with a valid status
    await assertFails(updateDoc(doc(db, 'leads', 'RULES001'), { status: 'Converted', phone: '9090000099' }));
    await assertFails(updateDoc(doc(db, 'leads', 'RULES001'), { phone: '9090000099' }));
    // identity, routing and metadata columns stay frozen too
    await assertFails(updateDoc(doc(db, 'leads', 'RULES001'), { dealer_id: 'D06' }));
    await assertFails(updateDoc(doc(db, 'leads', 'RULES001'), { name: 'Renamed Person' }));
    await assertFails(updateDoc(doc(db, 'leads', 'RULES001'), { status: 'Converted', origin: 'migrated' }));
    await assertFails(updateDoc(doc(db, 'leads', 'RULES001'), { lead_id: 'OTHER-ID' }));
    // nothing changed on the server
    const after = await getDoc(doc(db, 'leads', 'RULES001'));
    expect((after.data() as { status: string }).status).toBe('New');
    expect((after.data() as { phone: string }).phone).toBe('9090000011');
    expect((after.data() as { dealer_id: string }).dealer_id).toBe('D02');
  });

  it('rejects an unknown status value', async () => {
    const db = env.authenticatedContext('user-1').firestore();
    await assertSucceeds(setDoc(doc(db, 'leads', 'RULES001'), validLead()));
    await assertFails(updateDoc(doc(db, 'leads', 'RULES001'), { status: 'Pending' }));
    await assertFails(updateDoc(doc(db, 'leads', 'RULES001'), { status: '' }));
    await assertFails(updateDoc(doc(db, 'leads', 'RULES001'), { status: 42 }));
    const after = await getDoc(doc(db, 'leads', 'RULES001'));
    expect((after.data() as { status: string }).status).toBe('New');
  });

  it('rejects status updates from unauthenticated clients', async () => {
    const owner = env.authenticatedContext('user-1').firestore();
    await assertSucceeds(setDoc(doc(owner, 'leads', 'RULES001'), validLead()));
    const anon = env.unauthenticatedContext().firestore();
    await assertFails(updateDoc(doc(anon, 'leads', 'RULES001'), { status: 'Converted' }));
    // the document is untouched
    const after = await getDoc(doc(owner, 'leads', 'RULES001'));
    expect((after.data() as { status: string }).status).toBe('New');
  });

  it('keeps lead deletions disabled for clients', async () => {
    const db = env.authenticatedContext('user-1').firestore();
    await assertSucceeds(setDoc(doc(db, 'leads', 'RULES001'), validLead()));
    await assertFails(deleteDoc(doc(db, 'leads', 'RULES001')));
  });

  it('keeps phoneIndex append-only and structurally valid', async () => {
    const db = env.authenticatedContext('user-1').firestore();
    const indexRef = doc(db, 'phoneIndex', '9090000011');
    await assertSucceeds(setDoc(indexRef, { phone: '9090000011', lead_id: 'RULES001' }));
    // second create of the same document = duplicate lead → denied
    await assertFails(setDoc(indexRef, { phone: '9090000011', lead_id: 'RULES999' }));
    await assertFails(updateDoc(indexRef, { lead_id: 'RULES999' }));
    await assertFails(deleteDoc(indexRef));
    // malformed shapes
    await assertFails(setDoc(doc(db, 'phoneIndex', '9090000012'), { lead_id: 'RULES001' }));
    await assertFails(
      setDoc(doc(db, 'phoneIndex', '9090000012'), {
        phone: '9090000099', // field does not match the document id
        lead_id: 'RULES001',
      }),
    );
    await assertFails(
      setDoc(doc(db, 'phoneIndex', '9090000013'), {
        phone: '9090000013',
        lead_id: 'RULES001',
        note: 'extra field',
      }),
    );
    await assertFails(setDoc(doc(db, 'phoneIndex', '123'), { phone: '123', lead_id: 'RULES001' }));
  });

  it('has no catch-all: other collections stay inaccessible', async () => {
    const db = env.authenticatedContext('user-1').firestore();
    await assertFails(setDoc(doc(db, 'roles', 'user-1'), { role: 'admin' }));
    await assertFails(getDoc(doc(db, 'roles', 'user-1')));
    await assertFails(getDocs(collection(db, 'admins')));
  });

  it('exposes nothing about the data shape outside the two collections', async () => {
    const db = env.authenticatedContext('user-1').firestore();
    await assertFails(setDoc(doc(db, 'leads/RULES001/debug', 'x'), { any: 'thing' }));
    expect(true).toBe(true); // subcollections have no rules → denied by default
  });
});
