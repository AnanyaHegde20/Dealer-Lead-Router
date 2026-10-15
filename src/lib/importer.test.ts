/**
 * Migration-script unit tests — pure CSV parsing + document building only.
 * No firebase-admin import, no network: real writes are covered by the
 * emulator suite (src/lib/emulator/importer.emulator.test.ts).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildLeadDocs,
  loadPrefixMap,
  parseCsv,
  type ParsedLeadRow,
} from '../../scripts/import_legacy_leads.mjs';

const ROOT = join(__dirname, '..', '..');
const cleanedCsv = readFileSync(join(ROOT, 'data-out', 'cleaned_leads.csv'), 'utf8');
const dealersCsv = readFileSync(join(ROOT, 'data', 'dealers.csv'), 'utf8');

const goodRow: Partial<ParsedLeadRow> = {
  lead_id: 'L9001',
  name: 'Test Person',
  phone: '9123456789',
  pincode: '502285',
  dealer_id: 'D02',
  dealer_name: 'Kandi Energy Point',
  city: 'Sangareddy',
  product: 'PuREPower Home 5kWh',
  source: 'Website',
  created_on: '2026-10-01',
  status: 'New',
};

describe('parseCsv', () => {
  it('parses quoted fields and escaped quotes', () => {
    const rows = parseCsv('a,b\n"x,1","say ""hi"""\n');
    expect(rows).toEqual([{ a: 'x,1', b: 'say "hi"' }]);
  });

  it('handles CRLF line endings and skips blank lines', () => {
    const rows = parseCsv('a,b\r\n1,2\r\n\r\n');
    expect(rows).toEqual([{ a: '1', b: '2' }]);
  });
});

describe('loadPrefixMap', () => {
  it('maps every dealers.csv prefix to its dealer identity', () => {
    const map = loadPrefixMap(dealersCsv);
    expect(Object.keys(map)).toEqual(
      expect.arrayContaining(['500', '502', '506', '505', '530', '531', '520', '521', '522', '517']),
    );
    expect(map['502']).toEqual({
      dealer_id: 'D02',
      dealer_name: 'Kandi Energy Point',
      city: 'Sangareddy',
    });
    expect(map['530'].dealer_id).toBe(map['531'].dealer_id); // shared dealer
  });
});

describe('buildLeadDocs — the real cleaned CSV', () => {
  it('accepts all 31 cleaned leads with zero errors', () => {
    const rows = parseCsv(cleanedCsv);
    expect(rows).toHaveLength(31);
    const { docs, errors } = buildLeadDocs(rows, loadPrefixMap(dealersCsv));
    expect(errors).toEqual([]);
    expect(docs).toHaveLength(31);
    expect(docs.every((doc) => doc.origin === 'migrated')).toBe(true);
    expect(docs[0].lead_id).toBe('L1001');
    const phones = docs.map((doc) => doc.phone);
    expect(new Set(phones).size).toBe(31);
  });
});

describe('buildLeadDocs — validation', () => {
  const prefixMap = loadPrefixMap(dealersCsv);
  const build = (rows: Array<Partial<ParsedLeadRow>>) => buildLeadDocs(rows, prefixMap);

  it('accepts a valid row', () => {
    const { docs, errors } = build([goodRow]);
    expect(errors).toEqual([]);
    expect(docs).toHaveLength(1);
    expect(docs[0]).toMatchObject({ lead_id: 'L9001', origin: 'migrated' });
  });

  it('rejects bad ids, phones, pincodes, dates and statuses', () => {
    expect(build([{ ...goodRow, lead_id: 'X' }]).errors[0]).toContain('lead_id');
    expect(build([{ ...goodRow, phone: '12345' }]).errors[0]).toContain('phone');
    expect(build([{ ...goodRow, pincode: '012345' }]).errors[0]).toContain('pincode');
    expect(build([{ ...goodRow, created_on: '01-01-2026' }]).errors[0]).toContain('created_on');
    expect(build([{ ...goodRow, status: 'Pending' }]).errors[0]).toContain('status');
    expect(build([{ ...goodRow, product: 'Unknown' }]).errors[0]).toContain('product');
    expect(build([{ ...goodRow, source: 'Email' }]).errors[0]).toContain('source');
  });

  it('rejects a dealer assignment that disagrees with the prefix table', () => {
    const wrongDealer = { ...goodRow, dealer_id: 'D01', dealer_name: 'Sri Sai Power Solutions', city: 'Hyderabad' };
    expect(build([wrongDealer]).errors[0]).toContain('dealer_id');
    const wrongName = { ...goodRow, dealer_name: 'Fake Energy' };
    expect(build([wrongName]).errors[0]).toContain('dealer_name');
    const wrongCity = { ...goodRow, city: 'Nowhere' };
    expect(build([wrongCity]).errors[0]).toContain('city');
  });

  it('routes unmatched pincodes to In-house Sales (empty dealer id)', () => {
    const inHouse: Partial<ParsedLeadRow> = {
      ...goodRow,
      lead_id: 'L9002',
      phone: '9876543210',
      pincode: '110001',
      dealer_id: '',
      dealer_name: 'In-house Sales',
      city: '',
    };
    const { docs, errors } = build([inHouse]);
    expect(errors).toEqual([]);
    expect(docs[0].dealer_id).toBe('');
  });

  it('rejects duplicate ids and phones', () => {
    expect(build([goodRow, { ...goodRow, lead_id: 'L9001', phone: '9111111111' }]).errors[0])
      .toContain('duplicate lead_id');
    expect(build([goodRow, { ...goodRow, lead_id: 'L9002' }]).errors[0])
      .toContain('duplicate phone');
  });
});
