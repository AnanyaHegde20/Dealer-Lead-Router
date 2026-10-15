Kandi

# PURE Energy · Dealer Lead Router

A dealer lead-routing application for PURE Energy: it cleans a legacy CSV of
customer leads, assigns each lead to a dealer by pincode prefix (with an
in-house fallback), and presents a dashboard, searchable lead list, and
validated add-lead form backed by authenticated Cloud Firestore.

- **Live site:** https://dealer-lead-router.web.app
- **Repository:** https://github.com/AnanyaHegde20/Dealer-Lead-Router
- **Detailed Firebase guide:** [FIREBASE_SETUP.md](FIREBASE_SETUP.md)
- **AI assistance log:** [AI_LOG.md](AI_LOG.md)

## Features

- **Data cleaning pipeline** — 40 legacy rows → 31 verified leads
  (25 imported, 5 fixed, 5 merged, 4 rejected, 1 routed to in-house sales),
  with a per-row reason in `reports/reconciliation.csv`. Source CSVs are
  never modified (SHA-256 `10CADE9D7F72E68C1891630925A98304BD3475E73A489FDD56C0E581251B9B91`
  for `data/dealers.csv`, `79A08A108BC0187065FDE46454C3F9A9A1407614A71F9ABC3DC7D13ED7463A9B`
  for `data/legacy_leads.csv`).
- **Lead assignment** — first three pincode digits select one of 8 dealers
  from `data/dealers.csv`; valid pincodes with no matching prefix fall back
  to *In-house Sales*; invalid pincodes are never assigned.
- **Dashboard** — totals by status and by dealer, computed from real data
  (no fabricated numbers), plus an empty state when no data exists.
- **Leads table** — free-text search plus status / dealer / origin filters.
- **Add Lead form** — inline validation for mobile and pincode, live dealer
  preview while typing, duplicate-mobile rejection, immediate refresh of
  Dashboard and Leads after a save.
- **Firebase Authentication** — email/password sign-in gates every route
  when a Firebase project is configured; without configuration the app runs
  in clearly-labelled **local mode** (bundled CSV + this session's memory).
- **Cloud Firestore storage** — race-safe duplicate handling via a
  transactional `phoneIndex` collection, least-privilege security rules.

## Tech stack

| Layer | Technologies |
| --- | --- |
| Frontend | React 19, TypeScript, Vite 8, Tailwind CSS 4 |
| Cloud | Firebase (JS SDK 13) — Auth + Firestore; firebase-admin 14 (migration); firebase-tools 14 (Hosting/rules/emulators) |
| Tests | Vitest 5 (unit + emulator suites), `@firebase/rules-unit-testing` 6, Python `unittest` |
| Data | Python 3.10 cleaning script (stdlib only) |

## Local setup

Prerequisites: **Node.js 24** (the version developed and verified against),
**Python 3.10+**, and a **JDK 17+** (only needed for `test:emulator`;
firebase-tools is pinned to `^14` because version 15 requires JDK 21).

```bash
git clone https://github.com/AnanyaHegde20/Dealer-Lead-Router.git
cd Dealer-Lead-Router
npm install
npm run dev          # start the dev server
```

Other commands:

```bash
npm run build        # typecheck + production bundle into dist/
npm run preview      # serve the production bundle locally
```

## Environment configuration

Copy the placeholder file and fill in your own project's values:

```bash
cp .env.example .env
```

`README.md` and `.env.example` contain **placeholders only**. The recognised
variables (names, not values):

- `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`,
  `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`,
  `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID` — your web app
  config from the Firebase console.
- `VITE_FIREBASE_AUTH_EMULATOR_HOST`, `VITE_FIREBASE_FIRESTORE_EMULATOR_HOST` —
  optional, to run the UI against local emulators.

`.env` is git-ignored and must never be committed. With no `.env` the app
boots in **local mode**: an amber banner explains that only the bundled
migrated leads plus this session's additions are shown, and nothing touches
the cloud.

Script-side variables (server only, never bundled):
`GOOGLE_APPLICATION_CREDENTIALS` + `GCLOUD_PROJECT` for production imports,
or `FIRESTORE_EMULATOR_HOST` + `GCLOUD_PROJECT` for emulator imports.
Keep any service-account key **outside** the repository.

## Data cleaning and import

```bash
# Clean the legacy CSV (read-only on originals) → data-out/ + reports/
python scripts/clean_legacy_leads.py

# Migrate the 31 cleaned leads into Firestore (idempotent, safe to re-run)
# Production:  set GOOGLE_APPLICATION_CREDENTIALS + GCLOUD_PROJECT, then:
node scripts/import_legacy_leads.mjs
# Emulator:    set FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 and
#              GCLOUD_PROJECT=demo-dealer-router, then run the same command.
```

Expected first run: `created=31 skipped=0 conflicts=0 invalid=0`; second run:
`created=0 skipped=31`. Conflicting or invalid rows are reported and the
process exits with code 1 — existing documents are **never overwritten**.

## Tests

```bash
python -m unittest discover -s tests   # cleaning pipeline (45 tests)
npm test                               # app unit tests (112 tests; the 30
                                       # emulator tests auto-skip without emulators)
npm run test:emulator                  # auth + security rules + repository +
                                       # migration, on local emulators (30 tests)
```

All three suites were run and passing at the time of this writing.

## Firebase deployment

- **Live:** https://dealer-lead-router.web.app (Firebase Hosting, serves
  `dist/` with a single-page rewrite to `index.html`).
- **Security rules:** deployed from `firestore.rules`
  (`npx firebase deploy --only firestore:rules`).
- **Hosting:** `npx firebase deploy --only hosting` (project configured in
  `.firebaserc`; see FIREBASE_SETUP.md for full setup steps).

## Security notes

- **Authentication first:** with a configured project, every route is behind
  the sign-in screen, and `firestore.rules` require a signed-in user for
  every read and write of `leads` and `phoneIndex`.
- **Exact field allowlist:** lead documents accept only the 12 known fields;
  a client-supplied `role`/`isAdmin` field rejects the whole write.
- **Dealer recomputed server-side:** the rules recompute the dealer from the
  pincode using the same prefix table, so clients cannot claim a dealer they
  were not routed to.
- **Immutable for clients:** no client-side updates or deletes of leads;
  `phoneIndex` is append-only, making one-lead-per-mobile database-enforced
  (transactional, race-safe).
- **Migration safety:** the import script validates every row against the
  same constraints the rules enforce before writing; it bypasses rules only
  because it uses the Admin SDK (by design), never weakening them.
- **No secrets in the repository:** no API keys, tokens, or service-account
  material are committed; `.env` is git-ignored and `.env.example` holds
  placeholders only.

## AI assistance

This project was developed with AI assistance from the `opencode` coding
agent; human review, console setup, deployment, and production verification
were performed by the developer. See [AI_LOG.md](AI_LOG.md) for a transparent
breakdown and [NOTE.md](NOTE.md) for a short engineering summary.
