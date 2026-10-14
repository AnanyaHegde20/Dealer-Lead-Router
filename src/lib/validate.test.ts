import { describe, expect, it } from 'vitest';
import {
  isValidMobile,
  isValidPincode,
  normalizeMobile,
  validateMobile,
  validatePincode,
} from './validate';

describe('validateMobile', () => {
  it('accepts a plain 10-digit Indian mobile', () => {
    expect(validateMobile('9447712782')).toEqual({ ok: true, value: '9447712782' });
    expect(isValidMobile('9447712782')).toBe(true);
  });

  it('accepts numbers starting with 6, 7, 8 and 9', () => {
    for (const number of ['6123456789', '7123456789', '8123456789', '9123456789']) {
      expect(isValidMobile(number)).toBe(true);
    }
  });

  it('keeps a valid number that happens to start with 91 (not a country code)', () => {
    // real lead L1031/L1038 — cutting "91" would corrupt it to 8 digits
    expect(normalizeMobile('9166838090')).toBe('9166838090');
    expect(isValidMobile('9166838090')).toBe(true);
  });

  it('removes spaces inside the number (real lead L1004)', () => {
    expect(normalizeMobile('98480 22 431')).toBe('9848022431');
    expect(validateMobile('98480 22 431')).toEqual({ ok: true, value: '9848022431' });
  });

  it('removes a +91 country code with a hyphen (real lead L1006)', () => {
    expect(validateMobile('+91-9000012345')).toEqual({ ok: true, value: '9000012345' });
  });

  it('removes a +91 country code with a space (real lead L1037)', () => {
    expect(validateMobile('+91 9633021001')).toEqual({ ok: true, value: '9633021001' });
  });

  it('removes a leading trunk zero', () => {
    expect(normalizeMobile('09166838090')).toBe('9166838090');
  });

  it('rejects the too-short number 12345 (real lead L1009)', () => {
    const result = validateMobile('12345');
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toContain('10 digits');
    expect(isValidMobile('12345')).toBe(false);
  });

  it('rejects a number with a wrong first digit', () => {
    expect(isValidMobile('1234567890')).toBe(false);
    expect(validateMobile('1234567890')).toEqual({
      ok: false,
      error: 'Mobile number must start with 6, 7, 8 or 9',
    });
  });

  it('rejects non-digit input', () => {
    expect(isValidMobile('944771278a')).toBe(false);
    expect(isValidMobile('call-me')).toBe(false);
  });

  it('rejects 12 digits that are not a country-code form', () => {
    expect(isValidMobile('981234567890')).toBe(false);
  });
});

describe('validatePincode', () => {
  it('accepts a real 6-digit pincode (real lead L1001)', () => {
    expect(validatePincode('502285')).toEqual({ ok: true, value: '502285' });
    expect(isValidPincode('502285')).toBe(true);
  });

  it('accepts the unmatched-but-valid pincode 110001 (real lead L1015)', () => {
    expect(validatePincode('110001')).toEqual({ ok: true, value: '110001' });
  });

  it('rejects the 4-digit pincode 5000 (real lead L1012)', () => {
    const result = validatePincode('5000');
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toContain('6 digits');
    expect(isValidPincode('5000')).toBe(false);
  });

  it('rejects pincodes with a leading zero', () => {
    expect(isValidPincode('012345')).toBe(false);
  });

  it('rejects pincodes with letters or spaces inside', () => {
    expect(isValidPincode('50228a')).toBe(false);
    expect(isValidPincode('502 28')).toBe(false);
    expect(isValidPincode('')).toBe(false);
  });
});
