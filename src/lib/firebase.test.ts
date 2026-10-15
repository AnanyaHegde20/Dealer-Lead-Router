/**
 * Unit tests for pure configuration/auth logic — no emulator and no real
 * Firebase project (npm test stays offline).
 */
import { describe, expect, it } from 'vitest';
import { mapAuthError, resolveAppAccess } from './auth';
import { readFirebaseConfig } from './firebase';
import { shouldLoadLeads } from './useLeads';

describe('readFirebaseConfig', () => {
  it('returns null when nothing is configured (local mode)', () => {
    expect(readFirebaseConfig({}, {})).toBeNull();
  });

  it('returns null when only partial values exist', () => {
    expect(readFirebaseConfig({ VITE_FIREBASE_API_KEY: 'k' }, {})).toBeNull();
    expect(
      readFirebaseConfig(
        { VITE_FIREBASE_API_KEY: 'k', VITE_FIREBASE_PROJECT_ID: 'p' },
        {},
      ),
    ).toBeNull();
  });

  it('reads a full config from environment variables', () => {
    const config = readFirebaseConfig(
      {
        VITE_FIREBASE_API_KEY: 'k',
        VITE_FIREBASE_AUTH_DOMAIN: 'demo.firebaseapp.com',
        VITE_FIREBASE_PROJECT_ID: 'demo',
        VITE_FIREBASE_APP_ID: '1:2:3:web:abc',
      },
      {},
    );
    expect(config).toEqual({
      apiKey: 'k',
      authDomain: 'demo.firebaseapp.com',
      projectId: 'demo',
      appId: '1:2:3:web:abc',
      storageBucket: undefined,
      messagingSenderId: undefined,
    });
  });

  it('synthesises demo credentials when emulator hosts are present', () => {
    const config = readFirebaseConfig(
      { VITE_FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099' },
      { GCLOUD_PROJECT: 'demo-dealer-router' },
    );
    expect(config).toMatchObject({
      apiKey: 'demo-api-key',
      authDomain: 'localhost',
      projectId: 'demo-dealer-router',
      appId: '1:0:0:web:demo',
    });
  });

  it('prefers explicit VITE_ values over process env', () => {
    const config = readFirebaseConfig(
      {
        VITE_FIREBASE_API_KEY: 'k',
        VITE_FIREBASE_AUTH_DOMAIN: 'a.web.app',
        VITE_FIREBASE_PROJECT_ID: 'explicit-project',
        VITE_FIREBASE_APP_ID: 'app',
      },
      { GCLOUD_PROJECT: 'other-project' },
    );
    expect(config?.projectId).toBe('explicit-project');
  });

  it('reads emulator hosts from process env (firebase emulators:exec)', () => {
    const config = readFirebaseConfig(
      {},
      { FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080', GCLOUD_PROJECT: 'demo-dealer-router' },
    );
    expect(config).not.toBeNull();
    expect(config?.projectId).toBe('demo-dealer-router');
  });
});

describe('resolveAppAccess', () => {
  it('stays on the splash screen while auth is initialising', () => {
    expect(resolveAppAccess({ configured: true, initializing: true, user: null })).toBe('splash');
  });

  it('shows the sign-in page when configured and signed out', () => {
    expect(resolveAppAccess({ configured: true, initializing: false, user: null })).toBe('signin');
  });

  it('shows the app when configured and signed in', () => {
    const user = { uid: 'u1' } as never;
    expect(resolveAppAccess({ configured: true, initializing: false, user })).toBe('app');
  });

  it('shows the app in local mode even without a user', () => {
    expect(resolveAppAccess({ configured: false, initializing: false, user: null })).toBe('app');
  });
});

describe('shouldLoadLeads (data-fetch gate)', () => {
  it('blocks every fetch while the auth gate is closed', () => {
    // splash: auth still initialising — a fetch here would be anonymous
    expect(shouldLoadLeads('splash')).toBe(false);
    // signin: user not signed in — firestore.rules would deny the read
    expect(shouldLoadLeads('signin')).toBe(false);
  });

  it('allows fetching only once the app shell is visible', () => {
    expect(shouldLoadLeads('app')).toBe(true);
  });

  it('matches resolveAppAccess for every gate state (regression: pre-auth fetch)', () => {
    const user = { uid: 'u1' } as never;
    expect(
      shouldLoadLeads(resolveAppAccess({ configured: true, initializing: true, user: null })),
    ).toBe(false);
    expect(
      shouldLoadLeads(resolveAppAccess({ configured: true, initializing: false, user: null })),
    ).toBe(false);
    expect(
      shouldLoadLeads(resolveAppAccess({ configured: true, initializing: false, user })),
    ).toBe(true);
    // local mode: no cloud data to protect → fetch enabled immediately
    expect(
      shouldLoadLeads(resolveAppAccess({ configured: false, initializing: false, user: null })),
    ).toBe(true);
  });
});

describe('mapAuthError', () => {
  it('maps wrong credentials to a friendly message', () => {
    expect(mapAuthError({ code: 'auth/invalid-credential' })).toBe('Incorrect email or password.');
    expect(mapAuthError({ code: 'auth/wrong-password' })).toBe('Incorrect email or password.');
    expect(mapAuthError({ code: 'auth/user-not-found' })).toBe('Incorrect email or password.');
  });

  it('maps other known codes', () => {
    expect(mapAuthError({ code: 'auth/invalid-email' })).toBe(
      'That email address is not valid.',
    );
    expect(mapAuthError({ code: 'auth/too-many-requests' })).toContain('Too many attempts');
    expect(mapAuthError({ code: 'auth/user-disabled' })).toContain('disabled');
    expect(mapAuthError({ code: 'auth/network-request-failed' })).toContain('Network error');
  });

  it('falls back to a generic message', () => {
    expect(mapAuthError(new Error('boom'))).toBe('Sign-in failed. Please try again.');
    expect(mapAuthError('string')).toBe('Sign-in failed. Please try again.');
  });
});
