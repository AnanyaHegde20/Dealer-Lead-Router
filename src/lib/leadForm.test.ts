/**
 * Tests for the Add Lead form logic:
 * valid submission, missing name, invalid mobile, invalid pincode,
 * dealer preview, unmatched dealer preview, duplicate mobile handling.
 * All against real data (dealers.json prefixes, real legacy edge cases).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  EMPTY_LEAD_FORM,
  getDealerPreview,
  submitLeadForm,
  validateLeadForm,
  type LeadFormValues,
} from './leadForm';
import {
  createMemoryLeadRepository,
  getLeadRepository,
  resetLeadRepository,
  setLeadRepository,
  type LeadRepository,
} from './leadRepository';

const validLead: LeadFormValues = {
  name: 'Ganesh Patil',
  phone: '9876543210',
  pincode: '502285',
  product: 'PuREPower Home 5kWh',
  source: 'WhatsApp',
};

beforeEach(() => {
  resetLeadRepository();
});

describe('validateLeadForm', () => {
  it('accepts a fully valid form', () => {
    expect(validateLeadForm(validLead)).toEqual({});
  });

  it('flags a missing customer name', () => {
    const errors = validateLeadForm({ ...validLead, name: '   ' });
    expect(errors.name).toBe('Customer name is required');
  });

  it('flags an invalid mobile (real legacy value 12345)', () => {
    const errors = validateLeadForm({ ...validLead, phone: '12345' });
    expect(errors.phone).toContain('10 digits');
  });

  it('flags an invalid pincode (real legacy value 5000)', () => {
    const errors = validateLeadForm({ ...validLead, pincode: '5000' });
    expect(errors.pincode).toContain('6 digits');
  });

  it('flags missing product and source', () => {
    const errors = validateLeadForm({ ...validLead, product: '', source: '' });
    expect(errors.product).toBe('Product is required');
    expect(errors.source).toBe('Source is required');
  });

  it('accepts messy but repairable input', () => {
    const errors = validateLeadForm({
      ...validLead,
      name: '  Ganesh Patil  ',
      phone: '+91-9876543210',
      pincode: '531001',
    });
    expect(errors).toEqual({});
  });
});

describe('getDealerPreview (dealer preview)', () => {
  it('previews the matched dealer from data-out/dealers.json', () => {
    expect(getDealerPreview('502285')).toEqual({
      dealer_id: 'D02',
      dealer_name: 'Kandi Energy Point',
      city: 'Sangareddy',
      matched: true,
    });
    expect(getDealerPreview('531001')?.dealer_id).toBe('D05'); // two-prefix dealer
    expect(getDealerPreview('506001')?.dealer_id).toBe('D03'); // Warangal, unused by legacy data
  });

  it('previews In-house Sales for a valid but unmatched pincode (L1015: 110001)', () => {
    expect(getDealerPreview('110001')).toEqual({
      dealer_id: '',
      dealer_name: 'In-house Sales',
      city: '',
      matched: false,
    });
  });

  it('returns null for invalid pincodes — they never get an assignment', () => {
    expect(getDealerPreview('5000')).toBeNull();
    expect(getDealerPreview('1100')).toBeNull();
    expect(getDealerPreview('')).toBeNull();
    expect(getDealerPreview('50228a')).toBeNull();
  });
});

describe('submitLeadForm — valid submission', () => {
  it('creates a normalized, dealer-assigned lead and stores it', async () => {
    const result = await submitLeadForm(
      { ...validLead, phone: '+91 9876543210' },
      getLeadRepository(),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.lead.phone).toBe('9876543210'); // normalized representation
    expect(result.lead.pincode).toBe('502285');
    expect(result.lead.dealer_id).toBe('D02');
    expect(result.lead.dealer_name).toBe('Kandi Energy Point');
    expect(result.lead.status).toBe('New');
    expect(result.lead.name).toBe('Ganesh Patil');
    expect(result.lead.created_on).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result.lead.lead_id).toMatch(/^L\d{4,}$/);

    const stored = await getLeadRepository().list();
    expect(stored).toHaveLength(1);
    expect(stored[0].lead_id).toBe(result.lead.lead_id);
  });

  it('routes an unmatched valid pincode to In-house Sales', async () => {
    const result = await submitLeadForm(
      { ...validLead, pincode: '110001' },
      getLeadRepository(),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.lead.dealer_name).toBe('In-house Sales');
    expect(result.lead.dealer_id).toBe('');
  });

  it('stores nothing when a field is missing', async () => {
    const result = await submitLeadForm({ ...validLead, name: '' }, getLeadRepository());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.name).toBe('Customer name is required');
    expect(await getLeadRepository().list()).toHaveLength(0);
  });
});

describe('submitLeadForm — field failures', () => {
  it('rejects an invalid mobile', async () => {
    const result = await submitLeadForm(
      { ...validLead, phone: '12345' },
      getLeadRepository(),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.phone).toContain('10 digits');
    expect(await getLeadRepository().list()).toHaveLength(0);
  });

  it('rejects an invalid pincode and never assigns a dealer', async () => {
    const result = await submitLeadForm(
      { ...validLead, pincode: '5000' },
      getLeadRepository(),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.pincode).toContain('6 digits');
    expect(await getLeadRepository().list()).toHaveLength(0);
  });
});

describe('submitLeadForm — duplicate mobile handling', () => {
  it('blocks a second lead with the same mobile in a different format', async () => {
    const repository = getLeadRepository();

    const first = await submitLeadForm(validLead, repository);
    expect(first.ok).toBe(true);

    // Same person, messy formatting: spaces + country code
    const second = await submitLeadForm(
      { ...validLead, name: 'Impostor Person', phone: '+91 9876 543210' },
      repository,
    );
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.errors.phone).toContain('already used by lead');
    expect(second.errors.phone).toContain('Ganesh Patil');

    const stored = await repository.list();
    expect(stored).toHaveLength(1);
    expect(stored[0].name).toBe('Ganesh Patil');
  });

  it('blocks a duplicate even when only the stored phone was formatted oddly', async () => {
    const repository = createMemoryLeadRepository();
    await submitLeadForm({ ...validLead, phone: '98480 22 431' }, repository);
    const second = await submitLeadForm(
      { ...validLead, name: 'Duplicate Person', phone: '9848022431' },
      repository,
    );
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.errors.phone).toContain('already used');
  });

  it('allows different people who simply share digits pattern', async () => {
    const repository = getLeadRepository();
    await submitLeadForm(validLead, repository);
    const second = await submitLeadForm(
      { ...validLead, phone: '9123456789' },
      repository,
    );
    expect(second.ok).toBe(true);
    expect(await repository.list()).toHaveLength(2);
  });
});

describe('repository swap', () => {
  it('routes submissions through whatever backend is installed', async () => {
    const seen: string[] = [];
    const fakeFirestore: LeadRepository = {
      async list() {
        return [];
      },
      async findByMobile() {
        return null;
      },
      async create(lead) {
        seen.push(`${lead.lead_id}:${lead.phone}`);
        return { ...lead, lead_id: 'L1011' };
      },
      async updateLeadStatus() {
        throw new Error('not used by the form');
      },
    };
    setLeadRepository(fakeFirestore);
    const result = await submitLeadForm(validLead, getLeadRepository());
    expect(result.ok).toBe(true);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toContain('9876543210');
    // the form surfaces the id the repository actually stored
    if (result.ok) expect(result.lead.lead_id).toBe('L1011');
    resetLeadRepository();
  });

  it('starts empty — no fabricated seed data', async () => {
    expect(await getLeadRepository().list()).toEqual([]);
    expect(EMPTY_LEAD_FORM.name).toBe('');
  });
});

describe('submitLeadForm — ID format (business-facing L####)', () => {
  it('produces sequential L1011, L1012, … ids across multiple creates', async () => {
    const repository = getLeadRepository();
    const first = await submitLeadForm(validLead, repository);
    const second = await submitLeadForm({ ...validLead, phone: '9876543211' }, repository);
    const third = await submitLeadForm({ ...validLead, phone: '9876543212' }, repository);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(third.ok).toBe(true);
    if (!(first.ok && second.ok && third.ok)) return;
    expect(first.lead.lead_id).toBe('L1011');
    expect(second.lead.lead_id).toBe('L1012');
    expect(third.lead.lead_id).toBe('L1013');
    const stored = await repository.list();
    expect(stored.map((row) => row.lead_id)).toEqual(['L1011', 'L1012', 'L1013']);
  });

  it('reuses the L#### format and never fabricates random string ids', async () => {
    const result = await submitLeadForm(validLead, getLeadRepository());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.lead.lead_id).toMatch(/^L\d{4,}$/);
  });

  it('fails fast and throws when the repository create rejects with an unexpected error', async () => {
    const failingRepo: LeadRepository = {
      async list() {
        return [];
      },
      async findByMobile() {
        return null;
      },
      async create() {
        throw new Error('Database write permission denied');
      },
      async updateLeadStatus() {},
    };

    await expect(submitLeadForm(validLead, failingRepo)).rejects.toThrow(
      'Database write permission denied',
    );
  });

  it('rejects if the repository fails to return a valid lead_id', async () => {
    const invalidRepo: LeadRepository = {
      async list() {
        return [];
      },
      async findByMobile() {
        return null;
      },
      async create(lead) {
        return { ...lead, lead_id: '' };
      },
      async updateLeadStatus() {},
    };

    await expect(submitLeadForm(validLead, invalidRepo)).rejects.toThrow(
      'Repository failed to assign a unique lead ID',
    );
  });
});
