# AI Log — PURE Energy · Dealer Lead Router

This file documents how AI assistance was used while building this project.
It describes categories of work rather than reproducing literal prompts, and
it deliberately contains no dates or results that cannot be verified from
the repository itself.

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
