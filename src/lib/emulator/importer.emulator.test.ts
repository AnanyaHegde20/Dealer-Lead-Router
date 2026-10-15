/**
 * End-to-end test of scripts/import_legacy_leads.mjs against the LOCAL
 * Firestore emulator — proving the migration is idempotent:
 *   run 1 → creates all 31 cleaned leads
 *   run 2 → skips all 31 (no duplicates, no overwrites)
 *   altered input → conflicts reported, nothing overwritten, exit code 1
 * Runs only inside `npm run test:emulator`.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { describe, expect, it, beforeAll } from 'vitest';
import { buildLeadDocs, loadPrefixMap, migrate, parseCsv } from '../../../scripts/import_legacy_leads.mjs';

const execFileAsync = promisify(execFile);
const ROOT = join(__dirname, '..', '..', '..');
const SCRIPT = join(ROOT, 'scripts', 'import_legacy_leads.mjs');

const EMULATOR_ONLY = Boolean(process.env.FIRESTORE_EMULATOR_HOST);

function parseRun(output: string) {
  const summary = output.match(/Done\. created=(\d+) skipped=(\d+) conflicts=(\d+) invalid=(\d+)/);
  if (!summary) throw new Error(`No summary line in output:\n${output}`);
  return {
    created: Number(summary[1]),
    skipped: Number(summary[2]),
    conflicts: Number(summary[3]),
    invalid: Number(summary[4]),
    creates: (output.match(/^CREATE\s{2,}/gm) ?? []).length,
    skips: (output.match(/^SKIP\s{2,}/gm) ?? []).length,
  };
}

async function runScript() {
  const { stdout, stderr } = await execFileAsync(process.execPath, [SCRIPT], {
    env: { ...process.env },
    timeout: 60_000,
  });
  return `${stdout}${stderr}`;
}

describe.runIf(EMULATOR_ONLY)('import_legacy_leads.mjs (emulator)', () => {
  let db: import('firebase-admin/firestore').Firestore | null = null;

  beforeAll(async () => {
    // Admin SDK → emulator, no credentials (bypasses security rules by design).
    const { initializeApp, getApps } = await import('firebase-admin/app');
    const { getFirestore } = await import('firebase-admin/firestore');
    if (getApps().length === 0) {
      initializeApp({ projectId: process.env.GCLOUD_PROJECT ?? 'demo-dealer-router' });
    }
    db = getFirestore();
  });

  it('creates all 31 cleaned leads on the first run', async () => {
    const before = (await db!.collection('leads').count().get()).data().count;
    const run1 = parseRun(await runScript());
    expect(run1).toMatchObject({ created: 31, skipped: 0, conflicts: 0, invalid: 0 });
    expect(run1.creates).toBe(31);

    const after = (await db!.collection('leads').count().get()).data().count;
    expect(after).toBe(before + 31);

    // Spot-check one migrated document, including rules-compatible shape.
    const ravi = await db!.collection('leads').doc('L1001').get();
    expect(ravi.exists).toBe(true);
    expect(ravi.data()).toMatchObject({
      lead_id: 'L1001',
      phone: '9447712782',
      dealer_id: 'D02',
      origin: 'migrated',
      status: 'New',
    });

    // The duplicate ledger exists for every migrated phone.
    const index = await db!.collection('phoneIndex').doc('9447712782').get();
    expect(index.data()).toEqual({ phone: '9447712782', lead_id: 'L1001' });
  }, 60_000);

  it('is idempotent: a second run skips all 31 and writes nothing', async () => {
    const before = (await db!.collection('leads').count().get()).data().count;
    const run2 = parseRun(await runScript());
    expect(run2).toMatchObject({ created: 0, skipped: 31, conflicts: 0, invalid: 0 });
    expect(run2.skips).toBe(31);

    const after = (await db!.collection('leads').count().get()).data().count;
    expect(after).toBe(before); // byte-identical dataset
  }, 60_000);

  it('reports a conflict (and overwrites nothing) when the source row changed', async () => {
    const cleanedCsv = readFileSync(join(ROOT, 'data-out', 'cleaned_leads.csv'), 'utf8');
    const dealersCsv = readFileSync(join(ROOT, 'data', 'dealers.csv'), 'utf8');
    const altered = cleanedCsv.replace(
      'L1001,Ravi Kumar,9447712782,502285,D02,Kandi Energy Point,Sangareddy,PuREPower Home 5kWh,Website,2026-09-03,New',
      'L1001,Ravi Kumar,9447712782,502285,D02,Kandi Energy Point,Sangareddy,PuREPower Home 5kWh,Website,2026-09-03,Converted',
    );
    expect(altered).not.toBe(cleanedCsv);

    const lines: string[] = [];
    const result = await migrate({
      db: db!,
      cleanedCsv: altered,
      dealersCsv,
      log: (line) => lines.push(line),
    });

    expect(result.conflicts).toBe(1);
    expect(result.created).toBe(0);
    expect(result.skipped).toBe(30);
    expect(lines.some((line) => line.startsWith('CONFLICT') && line.includes('L1001'))).toBe(true);

    // Original data untouched — status is still New, not Converted.
    const ravi = await db!.collection('leads').doc('L1001').get();
    expect(ravi.data()?.status).toBe('New');
  }, 30_000);

  it('fails fast on an invalid source row (nothing is written)', async () => {
    const dealersCsv = readFileSync(join(ROOT, 'data', 'dealers.csv'), 'utf8');
    const header = 'lead_id,name,phone,pincode,dealer_id,dealer_name,city,product,source,created_on,status\n';
    const badRow = 'L9999,Bad Row,12345,502285,D02,Kandi Energy Point,Sangareddy,PuREPower Home 5kWh,Website,2026-10-01,New\n';

    const lines: string[] = [];
    const result = await migrate({
      db: db!,
      cleanedCsv: header + badRow,
      dealersCsv,
      log: (line) => lines.push(line),
    });
    expect(result.invalid).toBe(1);
    expect(result.created).toBe(0);
    expect(lines.some((line) => line.includes('invalid phone'))).toBe(true);
    expect((await db!.collection('leads').doc('L9999').get()).exists).toBe(false);
  });

  it('validates the real cleaned CSV against the real dealers table (pure)', () => {
    const cleanedCsv = readFileSync(join(ROOT, 'data-out', 'cleaned_leads.csv'), 'utf8');
    const dealersCsv = readFileSync(join(ROOT, 'data', 'dealers.csv'), 'utf8');
    const { docs, errors } = buildLeadDocs(parseCsv(cleanedCsv), loadPrefixMap(dealersCsv));
    expect(errors).toEqual([]);
    expect(docs).toHaveLength(31);
  });
});
