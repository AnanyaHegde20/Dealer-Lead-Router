/**
 * Firebase client initialization.
 *
 * Configuration comes from VITE_FIREBASE_* environment variables
 * (copy .env.example → .env). NOTHING is hard-coded here — with no
 * environment set, `readFirebaseConfig` returns null and the app runs in
 * clearly-labelled LOCAL mode (bundled CSV + tab memory, no cloud data).
 *
 * Emulator support: when FIREBASE_AUTH_EMULATOR_HOST /
 * FIRESTORE_EMULATOR_HOST are present (set automatically by
 * `firebase emulators:exec`), the SDKs are pointed at the local emulators
 * and demo credentials are synthesised — still no real secrets involved.
 */
import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, type Auth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore, type Firestore } from 'firebase/firestore';

export interface FirebaseWebConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
  storageBucket?: string;
  messagingSenderId?: string;
}

type StringEnv = Record<string, string | undefined>;

function nodeEnv(): StringEnv {
  const proc = (globalThis as { process?: { env?: StringEnv } }).process;
  return proc?.env ?? {};
}

/**
 * Pure, testable config reader. Returns null unless enough values exist
 * (either from .env or from an emulator environment) — never invents a
 * production project.
 */
export function readFirebaseConfig(
  env: StringEnv = import.meta.env as StringEnv,
  processEnv: StringEnv = nodeEnv(),
): FirebaseWebConfig | null {
  const authEmulator = env.VITE_FIREBASE_AUTH_EMULATOR_HOST ?? processEnv.FIREBASE_AUTH_EMULATOR_HOST;
  const firestoreEmulator = env.VITE_FIREBASE_FIRESTORE_EMULATOR_HOST ?? processEnv.FIRESTORE_EMULATOR_HOST;
  const emulatorMode = Boolean(authEmulator || firestoreEmulator);

  const projectId =
    env.VITE_FIREBASE_PROJECT_ID ?? processEnv.GCLOUD_PROJECT ?? processEnv.GOOGLE_CLOUD_PROJECT;
  const apiKey = env.VITE_FIREBASE_API_KEY ?? (emulatorMode ? 'demo-api-key' : undefined);
  const authDomain = env.VITE_FIREBASE_AUTH_DOMAIN ?? (emulatorMode ? 'localhost' : undefined);
  const appId = env.VITE_FIREBASE_APP_ID ?? (emulatorMode ? '1:0:0:web:demo' : undefined);

  if (!apiKey || !projectId || !authDomain || !appId) {
    return null;
  }
  return {
    apiKey,
    authDomain,
    projectId,
    appId,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  };
}

/** True when the app should talk to Firebase (real project or emulator). */
export const isFirebaseConfigured: boolean = readFirebaseConfig() !== null;

let cachedApp: FirebaseApp | null = null;

export function getFirebaseApp(): FirebaseApp {
  const config = readFirebaseConfig();
  if (!config) {
    throw new Error(
      'Firebase is not configured. Copy .env.example to .env and fill in your project values.',
    );
  }
  if (!cachedApp) {
    cachedApp = getApps().length > 0 ? getApp() : initializeApp(config);
  }
  return cachedApp;
}

function splitHost(host: string): { hostname: string; port: number } {
  const cleaned = host.replace(/^https?:\/\//, '');
  const [hostname, portText] = cleaned.split(':');
  return { hostname, port: Number(portText ?? 80) };
}

export function getFirebaseAuth(): Auth {
  const env = import.meta.env as StringEnv;
  const host =
    env.VITE_FIREBASE_AUTH_EMULATOR_HOST ?? nodeEnv().FIREBASE_AUTH_EMULATOR_HOST;
  const auth = getAuth(getFirebaseApp());
  if (host && !(auth as unknown as { __emulatorConnected?: boolean }).__emulatorConnected) {
    const { hostname, port } = splitHost(host);
    connectAuthEmulator(auth, `http://${hostname}:${port}`, { disableWarnings: true });
    (auth as unknown as { __emulatorConnected?: boolean }).__emulatorConnected = true;
  }
  return auth;
}

export function getFirebaseDb(): Firestore {
  const env = import.meta.env as StringEnv;
  const host =
    env.VITE_FIREBASE_FIRESTORE_EMULATOR_HOST ?? nodeEnv().FIRESTORE_EMULATOR_HOST;
  const db = getFirestore(getFirebaseApp());
  if (host && !(db as unknown as { __emulatorConnected?: boolean }).__emulatorConnected) {
    const { hostname, port } = splitHost(host);
    connectFirestoreEmulator(db, hostname, port);
    (db as unknown as { __emulatorConnected?: boolean }).__emulatorConnected = true;
  }
  return db;
}
