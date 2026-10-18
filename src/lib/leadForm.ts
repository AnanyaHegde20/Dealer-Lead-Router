/**
 * Add Lead form logic — pure functions so the UI stays thin and tests
 * can cover every rule without rendering a browser.
 *
 * Reuses (never duplicates) the shared rules from:
 *   validate.ts     -> mobile + pincode validation/normalization
 *   assignDealer.ts -> prefix routing against data-out/dealers.json
 */
import { assignDealer } from './assignDealer';
import { DuplicateMobileError, type LeadRepository } from './leadRepository';
import type { DealerAssignment, Lead, LeadSource, LeadStatus } from './types';
import { validateMobile, validatePincode } from './validate';

/** Real product values found in data-out/cleaned_leads.csv. */
export const PRODUCT_OPTIONS = [
  'PuREPower Home 3kWh',
  'PuREPower Home 5kWh',
  'PuREPower Commercial 10kWh',
] as const;

/** Real source values found in data-out/cleaned_leads.csv. */
export const SOURCE_OPTIONS: readonly LeadSource[] = [
  'Website',
  'Voice Agent',
  'Dealer Walk-in',
  'WhatsApp',
];

export interface LeadFormValues {
  name: string;
  phone: string;
  pincode: string;
  product: string;
  source: string;
}

export type LeadFormField = keyof LeadFormValues;
export type LeadFormErrors = Partial<Record<LeadFormField, string>>;

export const EMPTY_LEAD_FORM: LeadFormValues = {
  name: '',
  phone: '',
  pincode: '',
  product: '',
  source: '',
};

/** Synchronous field validation: missing required fields + mobile/pincode rules. */
export function validateLeadForm(values: LeadFormValues): LeadFormErrors {
  const errors: LeadFormErrors = {};
  if (!values.name.trim()) {
    errors.name = 'Customer name is required';
  }
  const phone = validateMobile(values.phone);
  if (!phone.ok) {
    errors.phone = phone.error;
  }
  const pincode = validatePincode(values.pincode);
  if (!pincode.ok) {
    errors.pincode = pincode.error;
  }
  if (!values.product) {
    errors.product = 'Product is required';
  }
  if (!values.source) {
    errors.source = 'Source is required';
  }
  return errors;
}

/**
 * Dealer preview for the pincode field.
 * Delegates to assignDealer — invalid pincode => null (no assignment ever),
 * valid + no matching prefix => "In-house Sales".
 */
export function getDealerPreview(pincode: string): DealerAssignment | null {
  return assignDealer(pincode);
}

export type LeadFormSubmitResult =
  | { ok: true; lead: Lead }
  | { ok: false; errors: LeadFormErrors };

/**
 * Validate, de-duplicate, assign a dealer and persist through the
 * repository. Returns field errors instead of throwing.
 *
 * The duplicate check compares NORMALIZED mobiles: the candidate value is
 * normalized by validateMobile and compared against stored leads whose
 * phones are also always stored normalized, so "+91 9447712782" and
 * "9447712782" are correctly treated as the same person.
 */
export async function submitLeadForm(
  values: LeadFormValues,
  repository: LeadRepository,
): Promise<LeadFormSubmitResult> {
  const errors = validateLeadForm(values);
  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  const phoneResult = validateMobile(values.phone);
  const pincodeResult = validatePincode(values.pincode);
  if (!phoneResult.ok) return { ok: false, errors: { phone: phoneResult.error } };
  if (!pincodeResult.ok) return { ok: false, errors: { pincode: pincodeResult.error } };

  const phone = phoneResult.value;
  const existing = await repository.findByMobile(phone);
  if (existing) {
    return {
      ok: false,
      errors: {
        phone: `Mobile number already used by lead ${existing.lead_id}${
          existing.name ? ` (${existing.name})` : ''
        }`,
      },
    };
  }

  const assignment = assignDealer(pincodeResult.value);
  if (!assignment) {
    // Unreachable after validation — invalid pincodes never get a dealer.
    return {
      ok: false,
      errors: { pincode: 'Pincode must be exactly 6 digits starting with 1-9' },
    };
  }

  // The repository owns the business-facing id: it allocates the next
  // free L#### number (continuing after existing leads) and returns the
  // stored row, so the form never invents ids of its own.
  const lead: Lead = {
    lead_id: '',
    name: values.name.trim(),
    phone,
    pincode: pincodeResult.value,
    dealer_id: assignment.dealer_id,
    dealer_name: assignment.dealer_name,
    city: assignment.city,
    product: values.product,
    source: values.source as LeadSource,
    created_on: new Date().toISOString().slice(0, 10),
    status: 'New' satisfies LeadStatus,
    origin: 'session',
  };

  let saved: Lead;
  try {
    saved = await repository.create(lead);
  } catch (error) {
    // Race-safe duplicate: another submit claimed this mobile between our
    // findByMobile check and the write. The repository enforces it at the
    // database level (transactional phoneIndex), so surface it as a field
    // error instead of crashing the form.
    if (error instanceof DuplicateMobileError) {
      return { ok: false, errors: { phone: error.message } };
    }
    throw error;
  }
  if (!saved || !saved.lead_id) {
    throw new Error('Repository failed to assign a unique lead ID');
  }
  return { ok: true, lead: saved };
}
