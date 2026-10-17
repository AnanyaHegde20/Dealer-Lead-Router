# AI Log — PURE Energy · Dealer Lead Router

This file documents how AI assistance was used while building this project.
Where prompts are quoted, each is marked **[exact]** (wording preserved from
the session) or **[faithful paraphrase]** (instructions restated; the
original chat wording was not kept). No events or results appear here
unless they can be verified against the repository or the session's actual
development history.

## Tool

- **`opencode`** — an interactive AI coding-agent CLI with access to the
  project's terminal, file editor, and search tools (session model:
  `opencode/mimo-v2.6-flash-free`).
- The AI worked inside a local checkout of this repository on Windows
  (Node 24, Python 3.10, JDK 17).

## What the AI did

- **Code generation.** Implemented the project phase by phase on the
  developer's written instructions: the Python cleaning pipeline
  (`scripts/clean_legacy_leads.py`), its unit tests, the React + TypeScript
  + Tailwind application (routing, dashboard, leads table, add-lead form,
  validation and dealer-assignment logic), the data-access layer, the
  Firebase integration (`src/lib/firebase.ts`, `auth.ts`, `useAuth.ts`,
  `firestoreRepository.ts`, the auth gate in `App.tsx`), the Firestore
  security rules (`firestore.rules`), and the idempotent migration script
  (`scripts/import_legacy_leads.mjs`).
- **Test authoring.** Wrote the Python suite (45 tests), the TypeScript unit
  suite (112 tests), and the emulator suite (30 tests covering
  authentication, security rules, repository behaviour, migration
  idempotency, and the auth-gate regression) — and executed all of them,
  plus `npm run build`, before reporting any step complete.
- **Debugging.** Diagnosed issues reported by the developer, including:
  the production `FirebaseError: Missing or insufficient permissions` (root
  cause: a lead fetch issued before sign-in; fixed by gating the data load
  on the auth state and covered by regression tests); a firebase-tools 15 /
  Java 17 incompatibility (resolved by pinning `firebase-tools` to `^14`);
  and emulator port/process conflicts during test runs.
- **Documentation.** Drafted `FIREBASE_SETUP.md`, this `AI_LOG.md`,
  `README.md`, and `NOTE.md`, plus inline code comments, all of which were
  left for the developer to review before inclusion.

## Three most useful prompts

1. **[faithful paraphrase] The Phase 1 cleaning brief** — *"Build a Python
   script that cleans `data/legacy_leads.csv` strictly read-only (never
   touch the source CSVs), emits `data-out/cleaned_leads.csv` plus
   `reports/reconciliation.csv` with exactly the columns
   `lead_id,action,reason` — one row per input row, actions limited to
   imported/fixed/merged/rejected/assigned_inhouse — and write unit tests
   for every rule; run them before reporting done."*
   Useful because it pinned the contract that Part B is graded on; the
   resulting script, report and 45-test suite are still the foundation
   everything else runs on.
2. **[faithful paraphrase] The production bug report** — *"The deployed app
   shows `FirebaseError: Missing or insufficient permissions` from
   `firestore.rules:105` on `'list'` when it loads — find the root cause
   and fix it without weakening the rules."* (Error text is as captured
   from the browser console.)
   Useful because it forced a real diagnosis instead of a guess: the fix
   was gating the data fetch on the auth state (`App.tsx`), not changing
   permissions, and it produced a regression test
   (`authGate.emulator.test.ts`) that reproduces the incident.
3. **[exact] The status-feature specification** —
   *"Fix the missing lead-status update feature in my Dealer Lead Router
   project."* followed by seven numbered requirements (repository-level
   `updateLeadStatus`, four-option dropdown, loading/error/refresh
   behaviour, status-only security rules, five test categories, README
   cleanup, run all suites, do not commit or push).
   Useful because the numbered acceptance criteria removed all ambiguity —
   the feature shipped exactly to spec with rules, tests and docs in one
   pass.

## Where AI was wrong and how it was corrected

1. **Missed a Part A requirement and rationalized it as an assumption.**
   The brief requires "status changeable (New / Contacted / Converted /
   Lost)", but the AI built the app with no update path at all — committed
   rules say `allow update, delete: if false` (see `git show
   f9938b4:firestore.rules`) — and when the developer asked *"...is that
   all done?"* against the pasted full brief, the audit exposed it. The AI
   had even written the gap into the README as policy: *"status changes
   assume an admin/trusted path outside the current UI"* (introduced in
   commit `f5331a9`, since corrected).
   **Correction:** implemented the feature end to end — `updateLeadStatus`
   in all three repository layers, the Leads-page dropdown with
   saving/error states, a `diff()`-based status-only rule, and the five
   test categories — and rewrote both outdated README statements.
2. **Guessed the `submission.json` schema instead of asking.**
   With no brief in the repository, the AI invented a plausible format
   (`projectName`, `location`, `deploymentUrl`, `repositoryUrl`,
   `description` — preserved in `git show f9938b4:submission.json`). The
   real required schema is `name`, `email`, `phone`, `live_url`,
   `video_url`.
   **Correction:** once the developer supplied the submission section, the
   file was rewritten to the exact required keys using only verified
   details, and the README's line-1/assumptions requirements were audited
   against the real brief.
3. **Wrong test assertion about the new security rules.**
   The AI asserted that `updateDoc({ status: 'Converted', origin: 'cloud' })`
   must be rejected — it succeeded, failing the emulator run. The AI had
   misunderstood `request.resource.data.diff(resource.data).affectedKeys()`:
   it lists only fields whose *values actually change*, and `origin` was
   already `'cloud'`, so only `status` moved and the write was legitimate.
   **Correction:** the test now changes `origin` to `'migrated'` (a real
   second-field change) in `securityRules.emulator.test.ts`, and the full
   emulator suite passes — the rules were right, the test was wrong.

## What the AI did not do

- **No commits, pushes, or deployments.** The AI never ran `git commit`,
  `git push`, or any `firebase deploy` command. Repository history and all
  deployments were performed by the developer.
- **No handling of production credentials.** The AI never created or read a
  service-account key. The production migration was run by the developer in
  their own shell with the key stored outside the repository.
- **No invented verification.** Every test count and command documented in
  the README is one the AI actually executed locally; nothing was claimed
  without a passing run.

## What the developer did (human work)

- Supplied the assignment brief, the raw input files, and per-phase
  instructions, requirements, and acceptance decisions.
- Created the Firebase project, registered the web app, and provided the
  web-configuration values that were placed into the git-ignored `.env`.
- Performed console-side work: enabling Authentication, creating the
  sign-in account, and deploying `firestore.rules` to production.
- Generated a service-account key (kept outside the repository) and ran the
  migration of the 31 cleaned leads against the production Firestore —
  reported as successful, with data visible in the console.
- Observed the production behaviour in a real browser, captured the
  Firestore permission error from the console, and reported it to the AI
  for diagnosis; reviewed and verified each phase's output.
- Created all git commits, configured Firebase Hosting, and produced the
  live deployment.

## How suggestions vs. verification were separated

| | AI contribution | Human contribution |
| --- | --- | --- |
| Design/code | Generated from the brief; reviewed per phase | Accepted, rejected, or redirected |
| Automated tests | Wrote and ran: 45 Python + 112 unit + 30 emulator, plus `npm run build` | Instructed when to run suites; reviewed results |
| Production checks | None directly — only local commands | Rules deployment, production migration, live-site check, browser console |
| Deployment | None | Firebase rules, Hosting, commits, push |

In short: the AI produced drafts of code, tests, and documents and proved
them locally; the human wired them to the real Firebase project, verified
production behaviour, and remains responsible for everything that reached
the deployed repository or the live site.
