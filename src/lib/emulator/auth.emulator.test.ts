/**
 * Sign-in / sign-out against the LOCAL Auth emulator.
 * Runs only inside `npm run test:emulator` (firebase emulators:exec sets
 * FIREBASE_AUTH_EMULATOR_HOST); skipped by plain `npm test`.
 *
 * No real credentials exist here: the emulator accepts any password for
 * accounts it hosts, and the app itself only performs sign-in/sign-out.
 */
import { initializeApp, deleteApp, type FirebaseApp } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  signOut as firebaseSignOut,
  type Auth,
  type User,
} from 'firebase/auth';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resolveAppAccess, signIn, signOut } from '../auth';

const host = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const EMAIL = 'auth-emulator-user@demo.local';
const PASSWORD = 'emulator-password-1';

describe.runIf(Boolean(host))('auth helpers (emulator)', () => {
  let app: FirebaseApp;
  let auth: Auth;

  beforeAll(async () => {
    app = initializeApp({
      apiKey: 'demo-api-key',
      authDomain: 'localhost',
      projectId: 'demo-dealer-router',
      appId: '1:0:0:web:demo',
    });
    auth = getAuth(app);
    const { connectAuthEmulator } = await import('firebase/auth');
    connectAuthEmulator(auth, `http://${host}`, { disableWarnings: true });

    // Provision the account through the Auth emulator REST API (no admin SDK,
    // no console — mirrors "owner created this user ahead of time").
    const response = await fetch(
      `http://${host}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-api-key`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: EMAIL, password: PASSWORD, returnSecureToken: true }),
      },
    );
    expect(response.ok).toBe(true);
  });

  afterAll(async () => {
    await firebaseSignOut(auth).catch(() => undefined);
    await deleteApp(app).catch(() => undefined);
  });

  it('signs in the provisioned user with our signIn() helper', async () => {
    const credential = await signIn(EMAIL, PASSWORD, auth);
    expect(credential.user.email).toBe(EMAIL);
    expect(credential.user.uid).toBeTruthy();

    const observed = await new Promise<User | null>((resolve) => {
      const unsubscribe = onAuthStateChanged(auth, (user) => {
        unsubscribe();
        resolve(user);
      });
    });
    expect(observed?.email).toBe(EMAIL);
    expect(
      resolveAppAccess({ configured: true, initializing: false, user: observed }),
    ).toBe('app');
  });

  it('rejects a wrong password with a friendly message', async () => {
    await expect(signIn(EMAIL, 'definitely-wrong', auth)).rejects.toThrow(
      'Incorrect email or password.',
    );
  });

  it('rejects an unknown account without revealing which part failed', async () => {
    await expect(signIn('nobody@demo.local', PASSWORD, auth)).rejects.toThrow(
      'Incorrect email or password.',
    );
  });

  it('rejects malformed emails', async () => {
    await expect(signIn('not-an-email', PASSWORD, auth)).rejects.toThrow(
      'That email address is not valid.',
    );
  });

  it('signs out with our signOut() helper', async () => {
    await signIn(EMAIL, PASSWORD, auth);
    expect(auth.currentUser?.email).toBe(EMAIL);
    await signOut(auth);
    expect(auth.currentUser).toBeNull();
    expect(
      resolveAppAccess({ configured: true, initializing: false, user: auth.currentUser }),
    ).toBe('signin');
  });

  it('creates additional accounts through the emulator for isolation', async () => {
    const credential = await createUserWithEmailAndPassword(
      auth,
      'second-user@demo.local',
      'another-password',
    );
    expect(credential.user.email).toBe('second-user@demo.local');
    await firebaseSignOut(auth);
  });
});
