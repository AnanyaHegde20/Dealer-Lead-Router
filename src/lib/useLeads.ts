/**
 * React binding for the lead store: reads the combined
 * (migrated + session) repository whenever `revision` changes.
 * Pages re-read immediately after a save, so new leads show up
 * without refreshing the browser.
 *
 * Auth gate (Phase 5 fix): the fetch must wait until `access === 'app'`.
 * Reading earlier fires an UNAUTHENTICATED Firestore request while the app
 * is still on the splash/sign-in screen; firestore.rules rejects it with
 * "Missing or insufficient permissions". The gate also re-arms the effect
 * when a user signs in (and after sign-out, so no stale data lingers).
 */
import { useEffect, useState } from 'react';
import type { AppAccess } from './auth';
import { getLeadStore } from './leadData';
import type { Lead } from './types';

export interface LeadsState {
  leads: Lead[];
  ready: boolean;
}

/** True only once the auth gate has fully opened (app shell visible). */
export function shouldLoadLeads(access: AppAccess): boolean {
  return access === 'app';
}

export function useLeads(revision: number, enabled: boolean = true): LeadsState {
  const [state, setState] = useState<LeadsState>({ leads: [], ready: false });

  useEffect(() => {
    if (!enabled) {
      // Still on the splash or sign-in screen: do NOT touch Firestore.
      return;
    }
    let cancelled = false;
    void getLeadStore()
      .list()
      .then((rows) => {
        if (!cancelled) setState({ leads: rows, ready: true });
      })
      .catch((error: unknown) => {
        // Never hang on "Loading…": surface the cause and show an empty,
        // ready state instead (the empty state is honest — no data was read).
        console.error('[useLeads] failed to load leads', error);
        if (!cancelled) setState({ leads: [], ready: true });
      });
    return () => {
      cancelled = true;
    };
  }, [revision, enabled]);

  return state;
}
