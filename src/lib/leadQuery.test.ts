/**
 * Search/filter tests for the Leads page — driven by the real 31
 * migrated leads plus session submissions.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { getLeadStore, getMigratedLeads } from './leadData';
import { submitLeadForm, type LeadFormValues } from './leadForm';
import { DEFAULT_LEAD_QUERY, filterLeads, isDefaultQuery } from './leadQuery';
import { resetLeadRepository } from './leadRepository';

const migrated = getMigratedLeads();

const sessionLead: LeadFormValues = {
  name: 'Anjali Sharma',
  phone: '9123456789',
  pincode: '502285',
  product: 'PuREPower Home 3kWh',
  source: 'Website',
};

beforeEach(() => {
  resetLeadRepository();
});

describe('filterLeads — search', () => {
  it('returns everything for an empty search', () => {
    expect(filterLeads(migrated, DEFAULT_LEAD_QUERY)).toHaveLength(31);
    expect(filterLeads(migrated, { ...DEFAULT_LEAD_QUERY, search: '   ' })).toHaveLength(31);
  });

  it('matches a customer name case-insensitively', () => {
    const result = filterLeads(migrated, { ...DEFAULT_LEAD_QUERY, search: 'ravi kumar' });
    expect(result).toHaveLength(1);
    expect(result[0].lead_id).toBe('L1001');
  });

  it('matches a normalized mobile', () => {
    const result = filterLeads(migrated, { ...DEFAULT_LEAD_QUERY, search: '9565623510' });
    expect(result.map((lead) => lead.lead_id)).toEqual(['L1003']);
  });

  it('matches a lead id and a pincode', () => {
    expect(
      filterLeads(migrated, { ...DEFAULT_LEAD_QUERY, search: 'l1015' })[0]?.lead_id,
    ).toBe('L1015');
    expect(
      filterLeads(migrated, { ...DEFAULT_LEAD_QUERY, search: '530016' }),
    ).toHaveLength(3);
  });

  it('matches product and dealer name text', () => {
    expect(
      filterLeads(migrated, { ...DEFAULT_LEAD_QUERY, search: 'commercial 10kwh' }).length,
    ).toBeGreaterThan(0);
    expect(
      filterLeads(migrated, { ...DEFAULT_LEAD_QUERY, search: 'guntur battery' }),
    ).toHaveLength(2);
  });
});

describe('filterLeads — dropdowns', () => {
  it('filters by status', () => {
    expect(filterLeads(migrated, { ...DEFAULT_LEAD_QUERY, status: 'New' })).toHaveLength(13);
    expect(filterLeads(migrated, { ...DEFAULT_LEAD_QUERY, status: 'Lost' })).toHaveLength(6);
    expect(filterLeads(migrated, { ...DEFAULT_LEAD_QUERY, status: 'Contacted' })).toHaveLength(4);
    expect(filterLeads(migrated, { ...DEFAULT_LEAD_QUERY, status: 'Converted' })).toHaveLength(8);
  });

  it('filters by dealer id', () => {
    const kandi = filterLeads(migrated, { ...DEFAULT_LEAD_QUERY, dealer: 'D02' });
    expect(kandi).toHaveLength(8);
    expect(kandi.every((lead) => lead.dealer_id === 'D02')).toBe(true);
  });

  it('filters In-house Sales with the empty dealer id', () => {
    const inHouse = filterLeads(migrated, { ...DEFAULT_LEAD_QUERY, dealer: '' });
    expect(inHouse).toHaveLength(1);
    expect(inHouse[0].lead_id).toBe('L1015');
    expect(inHouse[0].dealer_name).toBe('In-house Sales');
  });

  it('filters by record origin', () => {
    expect(filterLeads(migrated, { ...DEFAULT_LEAD_QUERY, origin: 'migrated' })).toHaveLength(31);
    expect(filterLeads(migrated, { ...DEFAULT_LEAD_QUERY, origin: 'session' })).toHaveLength(0);
  });

  it('combines filters with AND', () => {
    const result = filterLeads(migrated, {
      search: '521137',
      status: 'New',
      dealer: 'D06',
      origin: 'migrated',
    });
    expect(result.every((lead) => lead.pincode === '521137')).toBe(true);
    expect(result.every((lead) => lead.status === 'New')).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });
});

describe('filterLeads — session submissions', () => {
  it('finds a just-submitted lead and separates origins', async () => {
    const store = getLeadStore();
    expect((await submitLeadForm(sessionLead, store)).ok).toBe(true);
    const leads = await store.list();

    expect(filterLeads(leads, { ...DEFAULT_LEAD_QUERY, origin: 'session' })).toHaveLength(1);
    expect(filterLeads(leads, { ...DEFAULT_LEAD_QUERY, origin: 'migrated' })).toHaveLength(31);

    const search = filterLeads(leads, { ...DEFAULT_LEAD_QUERY, search: 'anjali' });
    expect(search).toHaveLength(1);
    expect(search[0].origin).toBe('session');
    expect(search[0].dealer_id).toBe('D02');
    resetLeadRepository();
  });
});

describe('isDefaultQuery', () => {
  it('detects active filters', () => {
    expect(isDefaultQuery(DEFAULT_LEAD_QUERY)).toBe(true);
    expect(isDefaultQuery({ ...DEFAULT_LEAD_QUERY, search: 'x' })).toBe(false);
    expect(isDefaultQuery({ ...DEFAULT_LEAD_QUERY, status: 'New' })).toBe(false);
    expect(isDefaultQuery({ ...DEFAULT_LEAD_QUERY, dealer: 'D01' })).toBe(false);
    expect(isDefaultQuery({ ...DEFAULT_LEAD_QUERY, origin: 'session' })).toBe(false);
    expect(isDefaultQuery({ ...DEFAULT_LEAD_QUERY, search: '  ' })).toBe(true);
  });
});
