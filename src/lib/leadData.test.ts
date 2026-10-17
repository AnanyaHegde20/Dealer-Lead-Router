/**
 * Tests for loading the migrated CSV, the combined store, and the
 * integration between submitted leads and the store.
 * Expected numbers come from the real data-out/cleaned_leads.csv (31 rows).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  createLeadStore,
  getLocalLeadStore,
  getMigratedLeads,
  loadMigratedLeads,
  resetLeadStatusOverrides,
} from './leadData';
import { submitLeadForm, type LeadFormValues } from './leadForm';
import {
  createMemoryLeadRepository,
  resetLeadRepository,
  setLeadRepository,
} from './leadRepository';

const newLead: LeadFormValues = {
  name: 'Anjali Sharma',
  phone: '9123456789',
  pincode: '531001',
  product: 'PuREPower Home 3kWh',
  source: 'Website',
};

beforeEach(() => {
  resetLeadRepository();
  resetLeadStatusOverrides();
});

describe('migrated legacy data', () => {
  it('loads all 31 cleaned leads from data-out/cleaned_leads.csv', () => {
    const leads = getMigratedLeads();
    expect(leads).toHaveLength(31);
    expect(leads.every((lead) => lead.origin === 'migrated')).toBe(true);
    expect(leads[0]).toMatchObject({
      lead_id: 'L1001',
      name: 'Ravi Kumar',
      phone: '9447712782',
      dealer_id: 'D02',
      dealer_name: 'Kandi Energy Point',
      status: 'New',
    });
  });

  it('has unique normalized mobiles and valid pincodes', () => {
    const phones = getMigratedLeads().map((lead) => lead.phone);
    expect(new Set(phones).size).toBe(31);
    for (const lead of getMigratedLeads()) {
      expect(lead.phone).toMatch(/^[6-9]\d{9}$/);
      expect(lead.pincode).toMatch(/^[1-9]\d{5}$/);
    }
  });

  it('contains the real In-house lead L1015 (pincode 110001)', () => {
    const inHouse = getMigratedLeads().filter((lead) => !lead.dealer_id);
    expect(inHouse).toHaveLength(1);
    expect(inHouse[0].lead_id).toBe('L1015');
    expect(inHouse[0].dealer_name).toBe('In-house Sales');
  });

  it('ignores rows without a known status', () => {
    const parsed = loadMigratedLeads('lead_id,name,phone,pincode,dealer_id,dealer_name,city,product,source,created_on,status\nL1,A,9123456789,502285,D02,Kandi Energy Point,Sangareddy,P,W,2026-01-01,Weird\n');
    expect(parsed).toHaveLength(0);
  });
});

describe('combined store (migrated + session)', () => {
  it('lists migrated leads without copying them into the session repository', async () => {
    const session = createMemoryLeadRepository();
    const store = createLeadStore(session);

    const rows = await store.list();
    expect(rows).toHaveLength(31);

    // nothing from the CSV is imported into session memory
    expect(await session.list()).toHaveLength(0);
    expect(await getLocalLeadStore().list()).toHaveLength(31); // global store also clean
  });

  it('finds duplicates across migrated data first', async () => {
    const store = createLeadStore(createMemoryLeadRepository());
    const found = await store.findByMobile('9447712782');
    expect(found?.lead_id).toBe('L1001');
    expect(await store.findByMobile('0000000000')).toBeNull();
  });

  it('writes new leads to the session layer only', async () => {
    const session = createMemoryLeadRepository();
    const store = createLeadStore(session);

    const result = await submitLeadForm(newLead, store);
    expect(result.ok).toBe(true);

    const all = await store.list();
    expect(all).toHaveLength(32);
    expect(await session.list()).toHaveLength(1);
    expect(all.filter((lead) => lead.origin === 'session')).toHaveLength(1);
  });

  it('blocks a submission that duplicates a migrated mobile', async () => {
    const store = createLeadStore(createMemoryLeadRepository());
    const result = await submitLeadForm(
      { ...newLead, name: 'Fake Ravi', phone: '+91 9447712782' },
      store,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.phone).toContain('already used');
    expect(result.errors.phone).toContain('L1001');
    expect(await store.list()).toHaveLength(31);
  });

  it('blocks duplicates of session leads too', async () => {
    const store = createLeadStore(createMemoryLeadRepository());
    expect((await submitLeadForm(newLead, store)).ok).toBe(true);
    const second = await submitLeadForm(
      { ...newLead, phone: '9123 456789' },
      store,
    );
    expect(second.ok).toBe(false);
    expect(await store.list()).toHaveLength(32);
  });

  it('shows a submitted lead immediately without any refresh (integration)', async () => {
    const session = createMemoryLeadRepository();
    setLeadRepository(session); // what the app does through getLeadStore()
    const store = getLocalLeadStore();

    const before = await store.list();
    expect(before.some((lead) => lead.phone === '9123456789')).toBe(false);

    const result = await submitLeadForm(newLead, store);
    expect(result.ok).toBe(true);
    const after = await store.list();

    expect(after.length).toBe(before.length + 1);
    expect(after.some((lead) => lead.phone === '9123456789' && lead.origin === 'session')).toBe(
      true,
    );
    resetLeadRepository();
  });
});

describe('status updates through the combined store (local mode)', () => {
  it('updates a session lead status in the session layer', async () => {
    const session = createMemoryLeadRepository();
    const store = createLeadStore(session);
    expect((await submitLeadForm(newLead, store)).ok).toBe(true);

    const created = (await store.list()).find((lead) => lead.phone === '9123456789');
    expect(created?.status).toBe('New');

    await store.updateLeadStatus(created!.lead_id, 'Lost');
    expect(
      (await store.list()).find((lead) => lead.lead_id === created!.lead_id)?.status,
    ).toBe('Lost');
    expect((await session.list())[0]?.status).toBe('Lost');
  });

  it('updates a migrated lead without mutating the bundled CSV rows', async () => {
    const store = createLeadStore(createMemoryLeadRepository());
    expect(
      (await store.list()).find((lead) => lead.lead_id === 'L1001')?.status,
    ).toBe('New');

    await store.updateLeadStatus('L1001', 'Converted');

    // the read-only source data is untouched…
    expect(getMigratedLeads().find((lead) => lead.lead_id === 'L1001')?.status).toBe('New');
    // …while the store (and every fresh instance of it) serves the new value
    expect(
      (await store.list()).find((lead) => lead.lead_id === 'L1001')?.status,
    ).toBe('Converted');
    expect(
      (await getLocalLeadStore().list()).find((lead) => lead.lead_id === 'L1001')?.status,
    ).toBe('Converted');
  });

  it('keeps every other migrated status unchanged after one update', async () => {
    const store = createLeadStore(createMemoryLeadRepository());
    const before = await store.list();
    await store.updateLeadStatus('L1001', 'Lost');
    const after = await store.list();

    expect(after).toHaveLength(before.length);
    expect(after.find((lead) => lead.lead_id === 'L1001')?.status).toBe('Lost');
    expect(before.find((lead) => lead.lead_id === 'L1001')?.status).toBe('New');
    for (const row of after) {
      if (row.lead_id === 'L1001') continue;
      expect(row.status).toBe(before.find((entry) => entry.lead_id === row.lead_id)?.status);
    }
  });

  it('rejects an unknown lead id', async () => {
    const store = createLeadStore(createMemoryLeadRepository());
    await expect(store.updateLeadStatus('NOPE-01', 'Lost')).rejects.toThrow(/not found/);
  });
});
