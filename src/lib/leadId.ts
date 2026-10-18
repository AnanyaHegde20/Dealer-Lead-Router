/**
 * Business-facing lead identifiers: `L` + a positive integer (L1001…L1039
 * are the migrated legacy leads; new cloud leads continue the sequence).
 *
 * The numeric part is allocated from the `counters/leadNumber` document
 * inside the create transaction (see firestoreRepository.ts), so concurrent
 * creates can never hand out the same number. These helpers are pure and
 * unit-tested: they define the format and the seeding rule used when the
 * counter document does not exist yet.
 */
export const LEAD_ID_START = 1040;

const LEAD_ID_PATTERN = /^L(\d{1,16})$/;

/** Format a numeric lead sequence value as a business-facing id. */
export function formatLeadId(number: number): string {
  if (!Number.isInteger(number) || number < 1) {
    throw new Error(`Invalid lead number: ${String(number)}`);
  }
  return `L${number}`;
}

/** Numeric part of an L#### id, or null when the id is not in that format. */
export function parseLeadNumber(id: string): number | null {
  const match = LEAD_ID_PATTERN.exec(id);
  return match ? Number(match[1]) : null;
}

/**
 * Next free lead number given ids already present in the database.
 * Used to seed ID allocation: any L#### id already stored wins, so
 * migrated legacy data (L1001…L1039) is never re-issued. With an empty
 * database or only lower IDs, the sequence starts at LEAD_ID_START.
 */
export function nextLeadNumberFromIds(ids: Iterable<string>): number {
  let max = 0;
  for (const id of ids) {
    const number = parseLeadNumber(id);
    if (number !== null && number > max) max = number;
  }
  return Math.max(max > 0 ? max + 1 : 0, LEAD_ID_START);
}

