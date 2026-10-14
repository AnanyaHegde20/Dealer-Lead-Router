import { EmptyState } from '../components/EmptyState';
import { PageHeader } from '../components/PageHeader';
import { PlusIcon } from '../components/icons';

/**
 * Add Lead placeholder. The actual form is Phase 3, so this screen only
 * documents the rules the form will enforce.
 */
export function AddLeadPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Add Lead" subtitle="Enter a new customer lead" />

      <EmptyState
        icon={<PlusIcon className="h-6 w-6" />}
        title="Lead form arrives in Phase 3"
        description="This screen will contain the validated lead entry form. Until then it stays empty — no fake submissions are accepted."
      >
        <ul className="mx-auto list-inside list-disc space-y-1 text-left">
          <li>Mobile: exactly 10 digits starting with 6/7/8/9, duplicates blocked</li>
          <li>Pincode: exactly 6 digits, dealer picked from the first three digits</li>
          <li>Valid pincode with no dealer prefix routes to In-house Sales</li>
          <li>Invalid pincodes are rejected and never get a dealer</li>
        </ul>
      </EmptyState>
    </div>
  );
}
