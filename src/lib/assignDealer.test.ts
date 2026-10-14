import { describe, expect, it } from 'vitest';
import { assignDealer, getDealerLookup, getDealers, getPrefixMap } from './assignDealer';

const lookup = getDealerLookup();

describe('dealers.json mapping (real Phase 1 output)', () => {
  it('contains all 8 dealers from data/dealers.csv', () => {
    expect(getDealers()).toHaveLength(8);
    expect(getDealers().map((d) => d.dealer_id)).toEqual([
      'D01', 'D02', 'D03', 'D04', 'D05', 'D06', 'D07', 'D08',
    ]);
  });

  it('exposes all 10 real prefixes', () => {
    expect(Object.keys(getPrefixMap()).sort()).toEqual([
      '500', '502', '505', '506', '517', '520', '521', '522', '530', '531',
    ]);
    expect(lookup.source).toBe('dealers.csv');
  });
});

describe('assignDealer — real prefixes from data/dealers.csv', () => {
  it('routes by the first three pincode digits', () => {
    const cases: Array<[string, string]> = [
      ['500081', 'D01'], // Sri Sai Power Solutions
      ['502285', 'D02'], // Kandi Energy Point
      ['502319', 'D02'],
      ['505001', 'D04'], // Karimnagar Solar Hub
      ['506123', 'D03'], // Warangal Green Systems (prefix unused by legacy data)
      ['517501', 'D08'], // Tirupati PowerHouse
      ['520010', 'D06'], // Krishna Energy Store
      ['521137', 'D06'],
      ['522002', 'D07'], // Guntur Battery World
      ['530016', 'D05'], // Vizag Home Power (two prefixes)
      ['531001', 'D05'],
    ];
    for (const [pincode, dealerId] of cases) {
      const result = assignDealer(pincode);
      expect(result, pincode).not.toBeNull();
      expect(result?.matched, pincode).toBe(true);
      expect(result?.dealer_id, pincode).toBe(dealerId);
    }
  });

  it('returns the real dealer name and city', () => {
    expect(assignDealer('502285')).toEqual({
      dealer_id: 'D02',
      dealer_name: 'Kandi Energy Point',
      city: 'Sangareddy',
      matched: true,
    });
  });
});

describe('assignDealer — unmatched valid pincode', () => {
  it('routes 110001 (Delhi, real lead L1015) to In-house Sales', () => {
    expect(assignDealer('110001')).toEqual({
      dealer_id: '',
      dealer_name: 'In-house Sales',
      city: '',
      matched: false,
    });
  });

  it('routes any valid prefix nobody owns to In-house Sales', () => {
    const result = assignDealer('600001');
    expect(result?.matched).toBe(false);
    expect(result?.dealer_name).toBe('In-house Sales');
  });
});

describe('assignDealer — invalid pincodes never get an assignment', () => {
  it('returns null instead of slicing a short pincode (L1012: "5000")', () => {
    // blind [:3] on "5000" would wrongly match prefix 500 -> D01
    expect(assignDealer('5000')).toBeNull();
  });

  it('returns null for every invalid form', () => {
    for (const bad of ['', '50228', '5022851', '50228a', '012345', '  ', 'abcde', '502 28']) {
      expect(assignDealer(bad), bad).toBeNull();
    }
  });
});
