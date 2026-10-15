/**
 * React binding for Firebase Authentication.
 *
 * configured=false → localMode (no cloud data exists to protect).
 * configured=true  → routes stay locked until onAuthStateChanged reports
 *                    a signed-in user.
 */
import { onAuthStateChanged, type User } from 'firebase/auth';
import { useEffect, useState } from 'react';
import { getFirebaseAuth, isFirebaseConfigured } from './firebase';

export interface AuthState {
  user: User | null;
  initializing: boolean;
  localMode: boolean;
  configured: boolean;
}

export function useAuth(): AuthState {
  const configured = isFirebaseConfigured;
  const [user, setUser] = useState<User | null>(null);
  const [initializing, setInitializing] = useState(configured);

  useEffect(() => {
    if (!configured) {
      setUser(null);
      setInitializing(false);
      return;
    }
    return onAuthStateChanged(getFirebaseAuth(), (nextUser) => {
      setUser(nextUser);
      setInitializing(false);
    });
  }, [configured]);

  return { user, initializing, localMode: !configured, configured };
}
