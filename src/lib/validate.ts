/**
 * Pure validation helpers shared by the lead form and the tests.
 * No React, no Firebase — just strings in, values or errors out.
 */
import type { ValidationResult } from './types';

/** 10-digit Indian mobile: first digit must be 6, 7, 8 or 9. */
export const MOBILE_REGEX = /^[6-9]\d{9}$/;

/** Indian pincode: exactly 6 digits, first digit 1-9 (so "012345" and "5000" fail). */
export const PINCODE_REGEX = /^[1-9]\d{5}$/;

/**
 * Strip decoration from a phone number:
 *   - spaces, hyphens, dots, brackets and a leading "+"
 *   - the "91" country code ONLY when it leaves exactly 10 digits
 *     (so "9166838090" is kept intact — it already is a valid number)
 *   - a leading trunk "0" when it leaves exactly 10 digits
 */
export function normalizeMobile(raw: string): string {
  let digits = (raw ?? '').replace(/[\s\-.()]/g, '');
  if (digits.startsWith('+')) digits = digits.slice(1);
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  return digits;
}

/** Validate and normalize a mobile number. Returns the 10-digit value or an error. */
export function validateMobile(raw: string): ValidationResult<string> {
  const value = normalizeMobile(raw ?? '');
  if (!/^\d+$/.test(value)) {
    return { ok: false, error: 'Mobile number must contain digits only' };
  }
  if (value.length !== 10) {
    return {
      ok: false,
      error: `Mobile number must have exactly 10 digits (got ${value.length})`,
    };
  }
  if (!MOBILE_REGEX.test(value)) {
    return { ok: false, error: 'Mobile number must start with 6, 7, 8 or 9' };
  }
  return { ok: true, value };
}

/** True when the mobile number is valid (convenience wrapper). */
export function isValidMobile(raw: string): boolean {
  return validateMobile(raw).ok;
}

/** Validate a pincode: exactly 6 digits, first digit 1-9. */
export function validatePincode(raw: string): ValidationResult<string> {
  const value = (raw ?? '').trim();
  if (!PINCODE_REGEX.test(value)) {
    return {
      ok: false,
      error: 'Pincode must be exactly 6 digits starting with 1-9',
    };
  }
  return { ok: true, value };
}

/** True when the pincode is valid (convenience wrapper). */
export function isValidPincode(raw: string): boolean {
  return validatePincode(raw).ok;
}
