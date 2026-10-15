/**
 * Mapper unit tests for the Firestore repository — pure functions, no
 * emulator and no network. Emulator behaviour lives in src/lib/emulator/.
 */
import { describe, expect, it } from 'vitest';
import { docToLead, LEAD_DOC_KEYS, leadToDoc } from './firestoreRepository';
import { DuplicateMobileError } from './leadRepository';
import type { Lead } from './types';

const sample: Lead = {
  lead_id: 'L1001',
  name: 'Ravi Kumar',
  phone: '9447712782',
  pincode: '502285',
  dealer_id: 'D02',
  dealer_name: 'Kandi Energy Point',
  city: 'Sangareddy',
  product: 'PuREPower Home 5kWh',
  source: 'Website',
  created_on: '2026-09-03',
  status: 'New',
  origin: 'migrated',
};

describe('leadToDoc', () => {
  it('produces exactly the field set the security rules allow', () => {
    const document = leadToDoc(sample);
    expect(Object.keys(document).sort()).toEqual([...LEAD_DOC_KEYS].sort());
  });

  it('keeps migrated origin and maps session → cloud', () => {
    expect(leadToDoc(sample).origin).toBe('migrated');
    expect(leadToDoc({ ...sample, origin: 'session' }).origin).toBe('cloud');
    expect(leadToDoc({ ...sample, origin: 'cloud' }).origin).toBe('cloud');
    expect(leadToDoc({ ...sample, origin: undefined }).origin).toBe('cloud');
  });
});

describe('docToLead', () => {
  it('round-trips a document', () => {
    const document = leadToDoc(sample);
    expect(docToLead(sample.lead_id, document)).toEqual(sample);
  });

  it('defaults unknown/missing origin to cloud', () => {
    const document = { ...leadToDoc(sample) } as Record<string, unknown>;
    delete document.origin;
    expect(docToLead(sample.lead_id, document).origin).toBe('cloud');
  });

  it('rejects malformed documents', () => {
    expect(() => docToLead('x', null)).toThrow(/Malformed/);
    expect(() => docToLead('x', { ...leadToDoc(sample), phone: 123 })).toThrow(/phone/);
    expect(() => docToLead('x', { ...leadToDoc(sample), status: 'Weird' })).toThrow(/status/);
  });
});

describe('DuplicateMobileError', () => {
  it('includes the holder lead id when known', () => {
    const error = new DuplicateMobileError('9447712782', 'L1001');
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('DuplicateMobileError');
    expect(error.message).toContain('L1001');
    expect(error.phone).toBe('9447712782');
  });

  it('falls back to a generic message without a holder', () => {
    expect(new DuplicateMobileError('9447712782').message).toBe(
      'This mobile number is already registered.',
    );
  });
});
