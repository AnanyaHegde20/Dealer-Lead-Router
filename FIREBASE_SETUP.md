# Firebase setup (Phase 5)

Everything needed to connect the Dealer Lead Router to Cloud Firestore and
Firebase Authentication. Nothing in this repository contains real secrets.

## What this repository already contains

| File | Purpose |
| --- | --- |
| `.env.example` | Placeholder for your own web-app keys — copy to `.env` |
| `firebase.json` | Emulator ports + points at `firestore.rules` |
| `firestore.rules` | Least-privilege security rules (see “Security decisions”) |
| `src/lib/firebase.ts` | Config reader + SDK init (emulator-aware) |
| `src/lib/auth.ts`, `src/lib/useAuth.ts` | Sign-in / sign-out / auth gate |
| `src/lib/firestoreRepository.ts` | `LeadRepository` backed by Firestore |
| `scripts/import_legacy_leads.mjs` | Idempotent migration of the 31 cleaned leads |
| `src/lib/emulator/*.test.ts` | Emulator test suite (`npm run test:emulator`) |

## 1. Create the Firebase project (once)

1. <https://console.firebase.google.com> → **Add project** (e.g. `dealer-lead-router`).
2. **Build → Authentication → Get started → Sign-in method → Email/Password → Enable**.
   (Sign-*up* stays disabled — accounts are created by the owner only.)
3. **Authentication → Users → Add user** — create the email/password you will sign in with.
4. **Project settings → Your apps → Web (`</>`)** — register an app, copy the
   `firebaseConfig` values.

## 2. Configure the app locally

```bash
cp .env.example .env    # then paste your values into .env
```

`.env` is git-ignored; `.env.example` stays committed with placeholders only.
With no `.env`, the app runs in **local mode**: an amber banner explains that
only the bundled CSV plus this session's submissions are shown — no cloud data.

## 3. Deploy the security rules (once, then after every rules change)

```bash
npx firebase login
npx firebase deploy --only firestore:rules
```

Rules are enforced by the emulator automatically (loaded from `firebase.json`).

## 4. Migrate the 31 cleaned leads (idempotent)

The script reads **only** `data-out/cleaned_leads.csv` (never the uncleaned
legacy CSV), validates every row against `data/dealers.csv`, and writes each
lead in its own transaction.

```bash
# Production target (service-account JSON kept OUTSIDE git)
export GOOGLE_APPLICATION_CREDENTIALS=/secure/path/serviceAccount.json
export GCLOUD_PROJECT=your-project-id
node scripts/import_legacy_leads.mjs

# Local emulator target (no credentials at all)
export FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
export GCLOUD_PROJECT=demo-dealer-router
node scripts/import_legacy_leads.mjs
```

Behaviour per row (document id = stable legacy `lead_id`, e.g. `L1001`):

| Situation | Result |
| --- | --- |
| lead missing | `CREATE` — lead + `phoneIndex` entry written in one transaction |
| lead exists, identical | `SKIP` — re-running changes nothing |
| lead exists, different | `CONFLICT` — **never overwritten**, process exits 1 |
| phone held by another lead | `CONFLICT` — **never reassigned**, process exits 1 |

Expected first run: `created=31 skipped=0 conflicts=0 invalid=0`.
Expected second run: `created=0 skipped=31 conflicts=0 invalid=0`.

## 5. Run it

```bash
npm run dev        # app (requires .env from step 2)
npm test           # unit tests — offline, no Firebase needed
npm run test:emulator   # auth + rules + repository + migration, all local
npm run build      # typecheck + production bundle
```

> `test:emulator` needs a JDK. firebase-tools 14 runs on **Java 17+**;
> firebase-tools 15+ requires **Java 21+** — this project pins `^14` so the
> existing Java 17 works. Upgrading to tools 15 means installing a JDK 21.

## Security decisions (why the rules look like this)

1. **Everything requires `request.auth != null`** — Firestore data (leads and
   the phone index) is invisible to anonymous clients. With no `.env` the UI
   falls back to local mode and clearly says cloud data is unavailable.
2. **Exact field allowlist** — leads accept only the 12 known fields
   (`keys().hasAll(...)` + `keys().hasOnly(...)`). A client-supplied `role`,
   `isAdmin` or `dealer_override` field makes the whole write fail, so there
   is no privilege field to forge.
3. **Dealer recomputed from the pincode** — `expectedDealerId(pincode)`
   mirrors `data/dealers.csv` prefixes, and `dealer_name`/`city` must match
   that dealer id. A client cannot send a lead to a dealer it was not routed
   to, nor claim “In-house Sales” while naming a real dealer. (If
   `data/dealers.csv` ever changes, regenerate the matching functions in
   `firestore.rules`.)
4. **Status-only updates** — clients may update nothing but `status` (one of
   the four known values); a field diff rejects any write that also touches
   the phone or any other column, and `delete` stays denied. `phoneIndex` is
   append-only, which is what makes the uniqueness ledger tamper-resistant.
5. **Duplicate detection is database-enforced** — `findByMobile()` is only a
   friendly fast path; the guarantee is the transactional `phoneIndex`
   write: two concurrent creates for the same mobile cannot both commit, so
   the check survives races (verified by the emulator test that skips the
   fast path entirely).
6. **No catch-all / no other collections** — `roles/*`, `admins/*`, subcollections
   and anything not explicitly matched are denied by default (least
   privilege), verified by tests.

## Known limitations

- **Cloud concurrency:** the in-app duplicate check is not a *transaction*
  (only the migration script is) — under a two-client race the second create
  fails with `DuplicateMobileError` and the form shows the error; it never
  overwrites. Migration conflicts are report-only (exit 1), never auto-fixed.
- Sign-up is intentionally absent; new users are created in the Firebase
  console (or Auth emulator) by the owner.
- Nothing has been deployed to Firebase Hosting, and README.md is untouched —
  both are reserved for the final submission phase.

## Test coverage map

| Suite | Command | Needs |
| --- | --- | --- |
| Cleaning (45) | `python -m unittest discover -s tests` | nothing |
| App logic (109) | `npm test` | nothing (emulator suites auto-skip) |
| Auth + rules + repo + migration (28) | `npm run test:emulator` | JDK 17+, network once (emulator jars) |
