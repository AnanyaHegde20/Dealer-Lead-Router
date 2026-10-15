/**
 * Auth-gate regression tests against the LOCAL emulators.
 *
 * Reproduces the exact production incident:
 *   `FirebaseError: Missing or insufficient permissions`
 * Cause: useLeads fired getDocs(collection('leads')) while no user was
 * signed in; firestore.rules (allow read: if signedIn()) rejected it.
 *
 * These tests pin down BOTH sides:
 *   1. The rules (correctly) deny every repository operation when the
 *      request is anonymous — this is what the app used to send.
 *   2. The same operations succeed once a user is signed in — proving the
 *      rules were never the problem and no rules change is needed.
 *   3. The app-level gate (shouldLoadLeads) never allows the fetch before
 *      the sign-in screen has been passed.
 *
 * Runs only inside `npm run test:emulator`.
 */
import { initializeApp, deleteApp, type FirebaseApp } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore, type Firestore } from 'firebase/firestore';
import { afterAll, describe, expect, it } from 'vitest';
import { resolveAppAccess } from '../auth';
import { createFirestoreRepository } from '../firestoreRepository';
import { shouldLoadLeads } from '../useLeads';

const fsHost = process.env.FIRESTORE_EMULATOR_HOST;
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const PROJECT = 'demo-dealer-router';

function connect(app: FirebaseApp): Firestore {
  const db = getFirestore(app);
  const [hostname, portText] = fsHost!.split(':');
  connectFirestoreEmulator(db, hostname, Number(portText));
  return db;
}

describe.runIf(Boolean(fsHost && authHost))('auth gate vs firestore.rules (emulator)', () => {
  const apps: FirebaseApp[] = [];

  afterAll(async () => {
    for (const app of apps) {
      await deleteApp(app).catch(() => undefined);
    }
  });

  it('reproduces the incident: every repository read is denied while anonymous', async () => {
    // A separate app instance with NO signed-in user → Firestore sends the
    // request with request.auth == null, exactly like the broken app did.
    const app = initializeApp(
      { apiKey: 'demo-api-key', authDomain: 'localhost', projectId: PROJECT, appId: '1:0:0:web:demo' },
      `gate-anon-${Date.now()}`,
    );
    apps.push(app);
    const repository = createFirestoreRepository(connect(app));

    // firestore.rules:105 / :119 → allow read: if signedIn()
    // The SDK reports FirebaseError code 'permission-denied' (the browser
    // renders this as "Missing or insufficient permissions").
    await expect(repository.list()).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(repository.findByMobile('9090000201')).rejects.toMatchObject({
      code: 'permission-denied',
    });
    // create path (form submit) is equally protected
    await expect(
      repository.create({
        lead_id: 'PRESET',
        name: 'Blocked',
        phone: '9090000201',
        pincode: '502285',
        dealer_id: 'D02',
        dealer_name: 'Kandi Energy Point',
        city: 'Sangareddy',
        product: 'PuREPower Home 5kWh',
        source: 'Website',
        created_on: '2026-10-05',
        status: 'New',
        origin: 'session',
      }),
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('the same operations succeed once a user is signed in (no rules change needed)', async () => {
    const app = initializeApp(
      { apiKey: 'demo-api-key', authDomain: 'localhost', projectId: PROJECT, appId: '1:0:0:web:demo' },
      `gate-auth-${Date.now()}`,
    );
    apps.push(app);
    const auth = getAuth(app);
    const { connectAuthEmulator } = await import('firebase/auth');
    connectAuthEmulator(auth, `http://${authHost}`, { disableWarnings: true });
    const db = connect(app);
    const repository = createFirestoreRepository(db);

    // Gate closed while signed out…
    expect(shouldLoadLeads(resolveAppAccess({ configured: true, initializing: false, user: null })))
      .toBe(false);

    await createUserWithEmailAndPassword(auth, 'gate-user@demo.local', 'gate-password-1');
    await new Promise<void>((resolve) => {
      const unsubscribe = onAuthStateChanged(auth, () => {
        unsubscribe();
        resolve();
      });
    });

    // …and open only now: the app would issue the fetch at this point.
    expect(
      shouldLoadLeads(
        resolveAppAccess({ configured: true, initializing: false, user: auth.currentUser }),
      ),
    ).toBe(true);

    const rows = await repository.list();
    expect(Array.isArray(rows)).toBe(true);
    expect(await repository.findByMobile('9090000201')).toBeNull();

    await firebaseSignOut(auth);
  });
});
