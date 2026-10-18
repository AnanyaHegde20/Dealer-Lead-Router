export const LEAD_ID_START = 1040;

const LEAD_ID_PATTERN = /^L(\d{1,16})$/;

export function formatLeadId(number: number): string {
  if (!Number.isInteger(number) || number < 1) {
    throw new Error(`Invalid lead number: ${String(number)}`);
  }
  return `L${number}`;
}

export function parseLeadNumber(id: string): number | null {
  const match = LEAD_ID_PATTERN.exec(id);
  return match ? Number(match[1]) : null;
}

export function nextLeadNumberFromIds(ids: Iterable<string>): number {
  let max = 0;
  for (const id of ids) {
    const number = parseLeadNumber(id);
    if (number !== null && number > max) max = number;
  }
  return Math.max(max > 0 ? max + 1 : 0, LEAD_ID_START);
}

