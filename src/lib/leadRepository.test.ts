/**
 * Tab-memory repository tests — the local-mode backend behind
 * getLeadStore(). Covers the status-update path end to end at the
 * lowest layer: success, isolation between rows, unknown ids.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  createMemoryLeadRepository,
  resetLeadRepository,
} from './leadRepository';
import type { Lead, LeadStatus } from './types';

function buildLead(lead_id: string, phone: string, status: LeadStatus = 'New'): Lead {
  return {
    lead_id,
    name: `Person ${lead_id}`,
    phone,
    pincode: '502285',
    dealer_id: 'D02',
    dealer_name: 'Kandi Energy Point',
    city: 'Sangareddy',
    product: 'PuREPower Home 5kWh',
    source: 'Website',
    created_on: '2026-10-01',
    status,
    origin: 'session',
  };
}

beforeEach(() => {
  resetLeadRepository();
});

describe('createMemoryLeadRepository.updateLeadStatus', () => {
  it('changes the status of the matching lead', async () => {
    const repository = createMemoryLeadRepository([buildLead('MEM00001', '9000000001')]);
    await repository.updateLeadStatus('MEM00001', 'Contacted');
    const rows = await repository.list();
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('Contacted');
  });

  it('walks through every allowed status', async () => {
    const repository = createMemoryLeadRepository([buildLead('MEM00002', '9000000002')]);
    for (const status of ['Contacted', 'Converted', 'Lost', 'New'] as const) {
      await repository.updateLeadStatus('MEM00002', status);
      expect((await repository.list())[0].status).toBe(status);
    }
  });

  it('touches only the target row', async () => {
    const repository = createMemoryLeadRepository([
      buildLead('MEM00003', '9000000003'),
      buildLead('MEM00004', '9000000004', 'Converted'),
    ]);
    await repository.updateLeadStatus('MEM00004', 'Lost');
    const rows = await repository.list();
    expect(rows.find((row) => row.lead_id === 'MEM00003')?.status).toBe('New');
    expect(rows.find((row) => row.lead_id === 'MEM00004')?.status).toBe('Lost');
  });

  it('rejects an unknown lead id', async () => {
    const repository = createMemoryLeadRepository();
    await expect(repository.updateLeadStatus('NOPE0001', 'Lost')).rejects.toThrow(/not found/);
  });
});
