import { describe, expect, it } from 'vitest';
import { formatLeadId, LEAD_ID_START, nextLeadNumberFromIds, parseLeadNumber } from './leadId';

describe('formatLeadId', () => {
  it('formats the business-facing L#### id', () => {
    expect(formatLeadId(1011)).toBe('L1011');
    expect(formatLeadId(1012)).toBe('L1012');
    expect(formatLeadId(1039)).toBe('L1039');
    expect(formatLeadId(1040)).toBe('L1040');
  });

  it('rejects non-integer and non-positive numbers', () => {
    expect(() => formatLeadId(0)).toThrow(/Invalid lead number/);
    expect(() => formatLeadId(-5)).toThrow(/Invalid lead number/);
    expect(() => formatLeadId(1.5)).toThrow(/Invalid lead number/);
    expect(() => formatLeadId(NaN)).toThrow(/Invalid lead number/);
  });
});

describe('parseLeadNumber', () => {
  it('extracts the numeric part of an L#### id', () => {
    expect(parseLeadNumber('L1001')).toBe(1001);
    expect(parseLeadNumber('L1039')).toBe(1039);
    expect(parseLeadNumber('L42')).toBe(42);
  });

  it('returns null for ids that are not L-numeric', () => {
    expect(parseLeadNumber('xox76PqfHPGD1QoAYMbW')).toBeNull();
    expect(parseLeadNumber('PRESET-LEAD-ID')).toBeNull();
    expect(parseLeadNumber('L')).toBeNull();
    expect(parseLeadNumber('l1001')).toBeNull();
    expect(parseLeadNumber('')).toBeNull();
  });
});

describe('nextLeadNumberFromIds', () => {
  it('starts at LEAD_ID_START on an empty database', () => {
    expect(nextLeadNumberFromIds([])).toBe(LEAD_ID_START);
    expect(LEAD_ID_START).toBe(1040);
    expect(nextLeadNumberFromIds(['RANDOM', 'xox76PqfHPGD1QoAYMbW'])).toBe(1040);
  });

  it('continues after the highest existing L#### id (never re-issues)', () => {
    expect(nextLeadNumberFromIds(['L1001', 'L1002', 'L1010'])).toBe(1040);
    expect(nextLeadNumberFromIds(['L1001', 'L1039'])).toBe(1040);
    expect(nextLeadNumberFromIds(['L1001', 'L1039', 'L1040'])).toBe(1041);
    expect(nextLeadNumberFromIds(['xox76PqfHPGD1QoAYMbW', 'L1039'])).toBe(1040);
  });

  it('ignores ids outside the L#### format', () => {
    expect(
      nextLeadNumberFromIds(['xox76PqfHPGD1QoAYMbW', 'PRESET-LEAD-ID', 'L1045']),
    ).toBe(1046);
    expect(nextLeadNumberFromIds(['random-id', 'other'])).toBe(LEAD_ID_START);
    expect(nextLeadNumberFromIds(['OLD-999', 'something-random'])).toBe(1040);
  });

  it('is not confused by numerically larger ids out of order', () => {
    expect(nextLeadNumberFromIds(['L1040', 'L1002', 'L1039'])).toBe(1041);
  });
});
