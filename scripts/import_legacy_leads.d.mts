export interface ParsedLeadRow {
  lead_id: string;
  name: string;
  phone: string;
  pincode: string;
  dealer_id: string;
  dealer_name: string;
  city: string;
  product: string;
  source: string;
  created_on: string;
  status: string;
}

export interface PrefixMapEntry {
  dealer_id: string;
  dealer_name: string;
  city: string;
}

export interface FirestoreLeadDoc extends ParsedLeadRow {
  origin: 'migrated' | 'cloud';
}

export function parseCsv(text: string): Record<string, string>[];
export function loadPrefixMap(csvText: string): Record<string, PrefixMapEntry>;
export function buildLeadDocs(
  rows: Array<Partial<ParsedLeadRow>>,
  prefixMap: Record<string, PrefixMapEntry>,
): { docs: FirestoreLeadDoc[]; errors: string[] };

export interface MigrateSummary {
  created: number;
  skipped: number;
  conflicts: number;
  invalid: number;
  conflictMessages?: string[];
}

export function migrate(options: {
  db: unknown;
  cleanedCsv: string;
  dealersCsv: string;
  log?: (line: string) => void;
}): Promise<MigrateSummary>;
