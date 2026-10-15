import { useState, type FormEvent, type ReactNode } from 'react';
import {
  EMPTY_LEAD_FORM,
  PRODUCT_OPTIONS,
  SOURCE_OPTIONS,
  getDealerPreview,
  submitLeadForm,
  validateLeadForm,
  type LeadFormErrors,
  type LeadFormValues,
} from '../lib/leadForm';
import { getLeadStore } from '../lib/leadData';
import { isFirebaseConfigured } from '../lib/firebase';
import type { Lead } from '../lib/types';
import { validateMobile } from '../lib/validate';
import { PlusIcon } from './icons';

interface LeadFormProps {
  /** Called after a lead is stored, so the page can show session feedback. */
  onSaved?: (lead: Lead) => void;
}

type TouchedFields = Partial<Record<keyof LeadFormValues, boolean>>;

const INPUT_BASE =
  'w-full rounded-lg border px-3 py-2.5 text-sm shadow-sm transition placeholder:text-slate-400 focus:outline-none focus:ring-2';

function inputClasses(hasError: boolean): string {
  return hasError
    ? `${INPUT_BASE} border-rose-400 focus:border-rose-500 focus:ring-rose-200`
    : `${INPUT_BASE} border-slate-300 focus:border-emerald-500 focus:ring-emerald-200`;
}

interface FieldProps {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}

function Field({ label, htmlFor, error, hint, children }: FieldProps) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
        <span className="text-rose-500"> *</span>
      </label>
      {children}
      {error ? (
        <p role="alert" className="mt-1.5 text-xs font-medium text-rose-600">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-slate-500">{hint}</p>
      ) : null}
    </div>
  );
}

/**
 * Live dealer preview under the pincode field.
 * Invalid pincodes never show an assignment — they show a warning instead.
 */
function DealerPreview({ pincode }: { pincode: string }) {
  const trimmed = pincode.trim();
  if (!trimmed) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
        Enter a 6-digit pincode to preview the assigned dealer.
      </div>
    );
  }
  const preview = getDealerPreview(trimmed);
  if (!preview) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
        Invalid pincode — no dealer will be assigned until it is exactly 6 digits.
      </div>
    );
  }
  if (!preview.matched) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <span className="font-semibold">In-house Sales</span> — no dealer owns pincode prefix{' '}
        {trimmed.slice(0, 3)}. This lead will be handled by the in-house team.
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
      Assigns to <span className="font-semibold">{preview.dealer_name}</span> ({preview.dealer_id},{' '}
      {preview.city}) — pincode prefix {trimmed.slice(0, 3)}.
    </div>
  );
}

export function LeadForm({ onSaved }: LeadFormProps) {
  const [values, setValues] = useState<LeadFormValues>(EMPTY_LEAD_FORM);
  const [touched, setTouched] = useState<TouchedFields>({});
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [remoteErrors, setRemoteErrors] = useState<LeadFormErrors>({});
  const [saving, setSaving] = useState(false);
  const [savedLead, setSavedLead] = useState<Lead | null>(null);

  const liveErrors = validateLeadForm(values);

  const errorFor = (field: keyof LeadFormValues) =>
    remoteErrors[field] ?? (touched[field] || submitAttempted ? liveErrors[field] : undefined);

  const phoneCheck = validateMobile(values.phone);
  const phoneHint =
    phoneCheck.ok && phoneCheck.value !== values.phone.trim() && values.phone.trim() !== ''
      ? phoneCheck.value
      : null;

  function updateField(field: keyof LeadFormValues, rawValue: string) {
    const value =
      field === 'pincode' ? rawValue.replace(/\D/g, '').slice(0, 6) : rawValue;
    setValues((prev) => ({ ...prev, [field]: value }) as LeadFormValues);
    setRemoteErrors({});
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitAttempted(true);
    setSaving(true);
    try {
      const result = await submitLeadForm(values, getLeadStore());
      if (!result.ok) {
        setRemoteErrors(result.errors);
        setSavedLead(null);
        return;
      }
      setRemoteErrors({});
      setSavedLead(result.lead);
      setValues(EMPTY_LEAD_FORM);
      setTouched({});
      setSubmitAttempted(false);
      onSaved?.(result.lead);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"
    >
      {savedLead ? (
        <div
          role="status"
          className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
        >
          <p className="font-semibold">
            Lead {savedLead.lead_id} created — assigned to {savedLead.dealer_name}
          </p>
          <p className="mt-0.5 text-xs">
            {isFirebaseConfigured
              ? 'Stored in Cloud Firestore and listed on the Leads and Dashboard pages.'
              : 'Saved in this browser session only — nothing has been sent to a server.'}
          </p>
        </div>
      ) : null}

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field
            label="Customer name"
            htmlFor="lead-name"
            error={errorFor('name')}
            hint="Full name of the person requesting the quote."
          >
            <input
              id="lead-name"
              name="name"
              type="text"
              autoComplete="name"
              placeholder="e.g. Ravi Kumar"
              value={values.name}
              onChange={(event) => updateField('name', event.target.value)}
              onBlur={() => setTouched((prev) => ({ ...prev, name: true }))}
              aria-invalid={Boolean(errorFor('name'))}
              className={inputClasses(Boolean(errorFor('name')))}
            />
          </Field>
        </div>

        <Field
          label="Mobile number"
          htmlFor="lead-phone"
          error={errorFor('phone')}
          hint={phoneHint ? `Will be stored as ${phoneHint}` : '10 digits, starting with 6/7/8/9.'}
        >
          <input
            id="lead-phone"
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="e.g. 98480 22 431 or +91-9848022431"
            value={values.phone}
            onChange={(event) => updateField('phone', event.target.value)}
            onBlur={() => setTouched((prev) => ({ ...prev, phone: true }))}
            aria-invalid={Boolean(errorFor('phone'))}
            className={inputClasses(Boolean(errorFor('phone')))}
          />
        </Field>

        <Field
          label="Pincode"
          htmlFor="lead-pincode"
          error={errorFor('pincode')}
          hint="First three digits choose the dealer."
        >
          <input
            id="lead-pincode"
            name="pincode"
            type="text"
            inputMode="numeric"
            maxLength={6}
            autoComplete="postal-code"
            placeholder="e.g. 502285"
            value={values.pincode}
            onChange={(event) => updateField('pincode', event.target.value)}
            onBlur={() => setTouched((prev) => ({ ...prev, pincode: true }))}
            aria-invalid={Boolean(errorFor('pincode'))}
            className={inputClasses(Boolean(errorFor('pincode')))}
          />
        </Field>

        <Field label="Product" htmlFor="lead-product" error={errorFor('product')}>
          <select
            id="lead-product"
            name="product"
            value={values.product}
            onChange={(event) => updateField('product', event.target.value)}
            onBlur={() => setTouched((prev) => ({ ...prev, product: true }))}
            aria-invalid={Boolean(errorFor('product'))}
            className={inputClasses(Boolean(errorFor('product')))}
          >
            <option value="">Select a product</option>
            {PRODUCT_OPTIONS.map((product) => (
              <option key={product} value={product}>
                {product}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Source" htmlFor="lead-source" error={errorFor('source')}>
          <select
            id="lead-source"
            name="source"
            value={values.source}
            onChange={(event) => updateField('source', event.target.value)}
            onBlur={() => setTouched((prev) => ({ ...prev, source: true }))}
            aria-invalid={Boolean(errorFor('source'))}
            className={inputClasses(Boolean(errorFor('source')))}
          >
            <option value="">Select a source</option>
            {SOURCE_OPTIONS.map((source) => (
              <option key={source} value={source}>
                {source}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="mt-5">
        <p className="mb-1.5 block text-sm font-medium text-slate-700">Dealer assignment</p>
        <DealerPreview pincode={values.pincode} />
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-5">
        <p className="text-xs text-slate-500">
          New leads are stored with status <span className="font-medium text-slate-700">New</span>.
        </p>
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <PlusIcon className="h-4 w-4" />
          {saving ? 'Saving…' : 'Save lead'}
        </button>
      </div>
    </form>
  );
}
