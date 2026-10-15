/**
 * Email/password authentication helpers (sign-in and sign-out only —
 * account creation happens in the Firebase console or via the emulator,
 * so registration is not open to the public).
 *
 * All functions accept an injectable Auth instance, which is how the
 * emulator tests exercise the real code path.
 */
import {
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  type Auth,
  type User,
  type UserCredential,
} from 'firebase/auth';
import { getFirebaseAuth } from './firebase';

/** Turn Firebase auth error codes into safe, user-friendly messages. */
export function mapAuthError(error: unknown): string {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code: unknown }).code)
      : '';
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Incorrect email or password.';
    case 'auth/invalid-email':
      return 'That email address is not valid.';
    case 'auth/user-disabled':
      return 'This account has been disabled.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a moment and try again.';
    case 'auth/network-request-failed':
      return 'Network error. Check your connection and try again.';
    default:
      return 'Sign-in failed. Please try again.';
  }
}

/** Sign in with email/password; throws an Error with a friendly message. */
export async function signIn(
  email: string,
  password: string,
  auth: Auth = getFirebaseAuth(),
): Promise<UserCredential> {
  try {
    return await signInWithEmailAndPassword(auth, email.trim(), password);
  } catch (error) {
    throw new Error(mapAuthError(error));
  }
}

/** Sign out; throws an Error with a friendly message. */
export async function signOut(auth: Auth = getFirebaseAuth()): Promise<void> {
  try {
    await firebaseSignOut(auth);
  } catch (error) {
    throw new Error(mapAuthError(error));
  }
}

export type AppAccess = 'splash' | 'signin' | 'app';

/**
 * Pure routing decision:
 *   - still checking auth           → splash
 *   - Firebase configured & no user → signin (lead data stays protected)
 *   - local mode (no configuration) → app   (only bundled data, no cloud)
 */
export function resolveAppAccess(options: {
  configured: boolean;
  initializing: boolean;
  user: User | null;
}): AppAccess {
  if (options.initializing) return 'splash';
  if (options.configured && !options.user) return 'signin';
  return 'app';
}
