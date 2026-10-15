/**
 * Dashboard calculation tests — all expectations are real counts from
 * data-out/cleaned_leads.csv (31 migrated leads).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { getLocalLeadStore, getMigratedLeads } from './leadData';
import { submitLeadForm, type LeadFormValues } from './leadForm';
import { resetLeadRepository } from './leadRepository';
import { computeDashboardStats, percentage } from './leadStats';

const sessionLead: LeadFormValues = {
  name: 'Anjali Sharma',
  phone: '9123456789',
  pincode: '110001', // unmatched -> In-house Sales
  product: 'PuREPower Home 3kWh',
  source: 'Website',
};

beforeEach(() => {
  resetLeadRepository();
});

describe('percentage', () => {
  it('rounds to one decimal and guards against zero totals', () => {
    expect(percentage(1, 3)).toBe(33.3);
    expect(percentage(13, 31)).toBe(41.9);
    expect(percentage(0, 0)).toBe(0);
    expect(percentage(5, 0)).toBe(0);
  });
});

describe('computeDashboardStats — migrated data', () => {
  const stats = computeDashboardStats(getMigratedLeads());

  it('computes the real totals', () => {
    expect(stats.total).toBe(31);
    expect(stats.migrated).toBe(31);
    expect(stats.session).toBe(0);
    expect(stats.inHouse).toBe(1);
  });

  it('computes the real status counts', () => {
    expect(stats.byStatus).toEqual({
      New: 13,
      Contacted: 4,
      Converted: 8,
      Lost: 6,
    });
    const sum = Object.values(stats.byStatus).reduce((total, count) => total + count, 0);
    expect(sum).toBe(stats.total);
  });

  it('computes the real dealer counts for every dealer', () => {
    const counts = Object.fromEntries(
      stats.dealerStats.map((dealer) => [dealer.dealer_id || 'INHOUSE', dealer.count]),
    );
    expect(counts).toEqual({
      D01: 2,
      D02: 8,
      D03: 0, // Warangal — owns prefix 506, receives no legacy leads
      D04: 2,
      D05: 5,
      D06: 9,
      D07: 2,
      D08: 2,
      INHOUSE: 1,
    });
    const sum = stats.dealerStats.reduce((total, dealer) => total + dealer.count, 0);
    expect(sum).toBe(stats.total);
  });

  it('sorts dealers by count, highest first', () => {
    expect(stats.dealerStats[0].dealer_id).toBe('D06'); // 9 leads
    expect(stats.dealerStats[1].dealer_id).toBe('D02'); // 8 leads
    expect(stats.dealerStats.at(-1)?.count).toBe(0); // D03 last
  });

  it('gives every dealer a share of the total', () => {
    for (const dealer of stats.dealerStats) {
      expect(dealer.share).toBe(percentage(dealer.count, stats.total));
    }
  });
});

describe('computeDashboardStats — with a session lead', () => {
  it('combines migrated and newly submitted leads', async () => {
    const store = getLocalLeadStore();
    expect((await submitLeadForm(sessionLead, store)).ok).toBe(true);
    const leads = await store.list();

    const stats = computeDashboardStats(leads);
    expect(stats.total).toBe(32);
    expect(stats.migrated).toBe(31);
    expect(stats.session).toBe(1);
    expect(stats.inHouse).toBe(2); // L1015 + the new 110001 lead
    expect(stats.byStatus.New).toBe(14);
    expect(stats.dealerStats.find((d) => d.dealer_name === 'In-house Sales')?.count).toBe(2);
    resetLeadRepository();
  });

  it('returns all zeros for an empty list without NaN', () => {
    const stats = computeDashboardStats([]);
    expect(stats.total).toBe(0);
    expect(stats.byStatus).toEqual({ New: 0, Contacted: 0, Converted: 0, Lost: 0 });
    expect(stats.dealerStats.every((dealer) => dealer.share === 0)).toBe(true);
    expect(Number.isNaN(stats.dealerStats[0].share)).toBe(false);
  });

  it('counts cloud, session and migrated origins separately', () => {
    const cloudLead = {
      ...getMigratedLeads()[0],
      lead_id: 'CLOUD01',
      origin: 'cloud' as const,
    };
    const stats = computeDashboardStats([...getMigratedLeads(), cloudLead]);
    expect(stats.cloud).toBe(1);
    expect(stats.migrated).toBe(31);
    expect(stats.session).toBe(0);
    expect(stats.total).toBe(32);
  });
});
