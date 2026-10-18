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

describe('createMemoryLeadRepository.create — business-facing L#### ids', () => {
  it('allocates L1040 as the first id on an empty repository', async () => {
    const repository = createMemoryLeadRepository();
    const saved = await repository.create(buildLead('', '9000000010'));
    expect(saved.lead_id).toBe('L1040');
    expect((await repository.list())[0].lead_id).toBe('L1040');
  });

  it('increments sequentially: L1040, L1041, L1042', async () => {
    const repository = createMemoryLeadRepository();
    const ids: string[] = [];
    for (const phone of ['9000000011', '9000000012', '9000000013']) {
      const saved = await repository.create(buildLead('', phone));
      ids.push(saved.lead_id);
    }
    expect(ids).toEqual(['L1040', 'L1041', 'L1042']);
  });

  it('continues after seeded legacy ids without duplicating them', async () => {
    const repository = createMemoryLeadRepository([
      buildLead('L1001', '9000000021'),
      buildLead('L1039', '9000000022'),
    ]);
    const saved = await repository.create(buildLead('', '9000000023'));
    expect(saved.lead_id).toBe('L1040');
  });

  it('never re-issues a taken id even when the caller proposes one', async () => {
    const repository = createMemoryLeadRepository([buildLead('L1040', '9000000031')]);
    const saved = await repository.create(buildLead('L1040', '9000000032'));
    expect(saved.lead_id).toBe('L1041');
    const ids = (await repository.list()).map((row) => row.lead_id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('ignores random non-L#### provisional ids from older callers', async () => {
    const repository = createMemoryLeadRepository();
    const saved = await repository.create(buildLead('xox76PqfHPGD1QoAYMbW', '9000000041'));
    expect(saved.lead_id).toBe('L1040');
  });

  it('returns the stored lead (id + payload) so callers can display it', async () => {
    const repository = createMemoryLeadRepository();
    const saved = await repository.create(buildLead('', '9000000051'));
    expect(saved).toMatchObject({ lead_id: 'L1040', phone: '9000000051', status: 'New' });
  });
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
