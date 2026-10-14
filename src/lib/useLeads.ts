/**
 * React binding for the lead store: reads the combined
 * (migrated + session) repository whenever `revision` changes.
 * Pages re-read immediately after a save, so new leads show up
 * without refreshing the browser.
 */
import { useEffect, useState } from 'react';
import { getLeadStore } from './leadData';
import type { Lead } from './types';

export interface LeadsState {
  leads: Lead[];
  ready: boolean;
}

export function useLeads(revision: number): LeadsState {
  const [state, setState] = useState<LeadsState>({ leads: [], ready: false });

  useEffect(() => {
    let cancelled = false;
    void getLeadStore()
      .list()
      .then((rows) => {
        if (!cancelled) setState({ leads: rows, ready: true });
      });
    return () => {
      cancelled = true;
    };
  }, [revision]);

  return state;
}
