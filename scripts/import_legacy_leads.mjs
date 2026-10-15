#!/usr/bin/env node
/**
 * Idempotent migration of the 31 cleaned legacy leads into Cloud Firestore.
 *
 * Source of truth: data-out/cleaned_leads.csv (Phase 1 output).
 * data/legacy_leads.csv (uncleaned) is NEVER read, and data/dealers.csv is
 * read-only — used only to VALIDATE that every row's dealer assignment
 * matches the prefix table (the same table firestore.rules uses).
 *
 * Idempotency & safety (per-row transaction):
 *   - lead document missing            → create lead + phoneIndex entry
 *   - lead exists and is byte-identical → skip (re-run = no-op)
 *   - lead exists but differs           → CONFLICT (never overwritten)
 *   - phone held by a different lead    → CONFLICT (never reassigned)
 * Exits 1 when any conflict is reported.
 *
 * Target selection:
 *   - FIRESTORE_EMULATOR_HOST set → emulator, no credentials needed
 *   - GOOGLE_APPLICATION_CREDENTIALS → service account (production)
 *
 * Usage:
 *   # against the local emulator
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 GCLOUD_PROJECT=demo-dealer-router \
 *     node scripts/import_legacy_leads.mjs
 *   # against a real project (keeps the key file outside git)
 *   GOOGLE_APPLICATION_CREDENTIALS=/secure/sa.json GCLOUD_PROJECT=my-project \
 *     node scripts/import_legacy_leads.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const VALID_STATUSES = new Set(['New', 'Contacted', 'Converted', 'Lost']);
const VALID_PRODUCTS = new Set([
  'PuREPower Home 3kWh',
  'PuREPower Home 5kWh',
  'PuREPower Commercial 10kWh',
]);
const VALID_SOURCES = new Set(['Website', 'Voice Agent', 'Dealer Walk-in', 'WhatsApp']);

/** Minimal RFC-4180 CSV parser (quoted fields, "" escapes). Exported for tests. */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (char !== '\r') {
      field += char;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  if (rows.length === 0) return [];
  const header = rows[0];
  return rows.slice(1).filter((r) => r.some((v) => v !== '')).map((r) => {
    const object = {};
    header.forEach((key, index) => {
      object[key] = r[index] ?? '';
    });
    return object;
  });
}

/** prefix_map from data/dealers.csv (read-only). Exported for tests. */
export function loadPrefixMap(csvText) {
  const map = {};
  for (const row of parseCsv(csvText)) {
    for (const prefix of row.pincode_prefixes.split('|')) {
      const trimmed = prefix.trim();
      if (trimmed) {
        map[trimmed] = {
          dealer_id: row.dealer_id,
          dealer_name: row.dealer_name,
          city: row.city,
        };
      }
    }
  }
  return map;
}

/**
 * Convert cleaned CSV rows into validated Firestore documents.
 * Returns { docs, errors } — errors are human-readable and must be empty
 * before anything is written.
 */
export function buildLeadDocs(rows, prefixMap) {
  const docs = [];
  const errors = [];
  const seenIds = new Set();
  const seenPhones = new Set();

  rows.forEach((row, index) => {
    const where = `row ${index + 1} (${row.lead_id ?? 'no id'})`;
    const fail = (message) => errors.push(`${where}: ${message}`);

    if (!/^[A-Za-z0-9_-]{5,20}$/.test(row.lead_id ?? '')) {
      return fail(`invalid lead_id "${row.lead_id}"`);
    }
    if (seenIds.has(row.lead_id)) return fail(`duplicate lead_id "${row.lead_id}"`);
    seenIds.add(row.lead_id);

    if (!/^[6-9]\d{9}$/.test(row.phone ?? '')) return fail(`invalid phone "${row.phone}"`);
    if (seenPhones.has(row.phone)) return fail(`duplicate phone "${row.phone}"`);
    seenPhones.add(row.phone);

    if (!/^[1-9]\d{5}$/.test(row.pincode ?? '')) return fail(`invalid pincode "${row.pincode}"`);
    if (!VALID_STATUSES.has(row.status)) return fail(`invalid status "${row.status}"`);
    if (!VALID_PRODUCTS.has(row.product)) return fail(`invalid product "${row.product}"`);
    if (!VALID_SOURCES.has(row.source)) return fail(`invalid source "${row.source}"`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.created_on ?? '')) {
      return fail(`invalid created_on "${row.created_on}"`);
    }
    if ((row.name ?? '').trim().length < 1) return fail('missing name');

    // Dealer assignment must match the same prefix table firestore.rules uses.
    const expected = prefixMap[row.pincode.slice(0, 3)];
    const expectedId = expected ? expected.dealer_id : '';
    const expectedName = expected ? expected.dealer_name : 'In-house Sales';
    const expectedCity = expected ? expected.city : '';
    if (row.dealer_id !== expectedId) {
      return fail(`dealer_id "${row.dealer_id}" != prefix table "${expectedId}"`);
    }
    if (row.dealer_name !== expectedName) {
      return fail(`dealer_name "${row.dealer_name}" != "${expectedName}"`);
    }
    if (row.city !== expectedCity) return fail(`city "${row.city}" != "${expectedCity}"`);

    docs.push({
      lead_id: row.lead_id,
      name: row.name.trim(),
      phone: row.phone,
      pincode: row.pincode,
      dealer_id: row.dealer_id,
      dealer_name: row.dealer_name,
      city: row.city,
      product: row.product,
      source: row.source,
      created_on: row.created_on,
      status: row.status,
      origin: 'migrated',
    });
  });

  return { docs, errors };
}

function stableDocument(document) {
  const keys = Object.keys(document).sort();
  const ordered = {};
  for (const key of keys) ordered[key] = document[key];
  return JSON.stringify(ordered);
}

async function getFirestore() {
  // Dynamic import keeps firebase-admin out of unit-test module graphs.
  const { initializeApp, applicationDefault, cert, getApps } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');

  const projectId = process.env.GCLOUD_PROJECT ?? process.env.GOOGLE_CLOUD_PROJECT;
  const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
  if (!emulatorHost && !process.env.GOOGLE_APPLICATION_CREDENTIALS && !projectId) {
    throw new Error(
      'Set FIRESTORE_EMULATOR_HOST (emulator) or GOOGLE_APPLICATION_CREDENTIALS ' +
        '+ GCLOUD_PROJECT (production). See FIREBASE_SETUP.md.',
    );
  }

  if (getApps().length === 0) {
    if (emulatorHost) {
      if (!projectId) {
        throw new Error('FIRESTORE_EMULATOR_HOST requires GCLOUD_PROJECT (e.g. demo-dealer-router).');
      }
      initializeApp({ projectId });
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      initializeApp({
        credential: cert(JSON.parse(readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8'))),
        projectId,
      });
    } else {
      initializeApp({ credential: applicationDefault(), projectId });
    }
  }
  return getFirestore();
}

export async function migrate({ db, cleanedCsv, dealersCsv, log = console.log } = {}) {
  const prefixMap = loadPrefixMap(dealersCsv);
  const rows = parseCsv(cleanedCsv);
  const { docs, errors } = buildLeadDocs(rows, prefixMap);
  if (errors.length > 0) {
    for (const line of errors) log(`INVALID  ${line}`);
    return { created: 0, skipped: 0, conflicts: errors.length, invalid: errors.length };
  }

  let created = 0;
  let skipped = 0;
  const conflicts = [];

  for (const document of docs) {
    const leadRef = db.collection('leads').doc(document.lead_id);
    const indexRef = db.collection('phoneIndex').doc(document.phone);

    try {
      const outcome = await db.runTransaction(async (transaction) => {
        const [leadSnap, indexSnap] = [await transaction.get(leadRef), await transaction.get(indexRef)];

        if (leadSnap.exists) {
          const same = stableDocument(leadSnap.data()) === stableDocument(document);
          if (same) {
            const indexOk =
              indexSnap.exists && indexSnap.data().lead_id === document.lead_id;
            if (indexOk) return 'skip';
            // Lead is correct but its index entry is missing/broken → repair it.
            transaction.set(indexRef, { phone: document.phone, lead_id: document.lead_id });
            return 'repair';
          }
          return `conflict: lead ${document.lead_id} already exists with different data`;
        }
        if (indexSnap.exists && indexSnap.data().lead_id !== document.lead_id) {
          return `conflict: phone ${document.phone} already held by ${indexSnap.data().lead_id}`;
        }
        transaction.set(indexRef, { phone: document.phone, lead_id: document.lead_id });
        transaction.set(leadRef, document);
        return 'create';
      });

      if (outcome === 'skip') {
        skipped += 1;
        log(`SKIP     ${document.lead_id}`);
      } else if (outcome === 'repair') {
        created += 1;
        log(`REPAIR   ${document.lead_id} (phoneIndex restored)`);
      } else if (outcome === 'create') {
        created += 1;
        log(`CREATE   ${document.lead_id}`);
      } else {
        conflicts.push(outcome);
        log(`CONFLICT ${outcome}`);
      }
    } catch (error) {
      conflicts.push(`${document.lead_id}: ${error instanceof Error ? error.message : error}`);
      log(`ERROR    ${document.lead_id}: ${error instanceof Error ? error.message : error}`);
    }
  }

  return { created, skipped, conflicts: conflicts.length, invalid: 0, conflictMessages: conflicts };
}

async function main() {
  const cleanedCsv = readFileSync(join(ROOT, 'data-out', 'cleaned_leads.csv'), 'utf8');
  const dealersCsv = readFileSync(join(ROOT, 'data', 'dealers.csv'), 'utf8');
  const db = await getFirestore();

  console.log('Importing cleaned legacy leads → Cloud Firestore');
  const result = await migrate({ db, cleanedCsv, dealersCsv });
  console.log(
    `Done. created=${result.created} skipped=${result.skipped} ` +
      `conflicts=${result.conflicts} invalid=${result.invalid}`,
  );
  if (result.conflicts > 0 || result.invalid > 0) {
    console.error('Conflicts/invalid rows found — nothing was overwritten.');
    process.exitCode = 1;
  }
}

const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (invokedDirectly) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
