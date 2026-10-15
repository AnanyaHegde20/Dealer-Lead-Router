# Engineering note (≈150 words)

The pipeline normalizes 40 legacy rows into 31 verified leads — 25 imported,
5 fixed, 5 merged, 4 rejected, 1 routed in-house — with a per-row reason in
`reports/reconciliation.csv`; source CSVs stay hash-frozen. Leads are
assigned by the first three pincode digits against `data/dealers.csv`, with
valid-but-unmatched pincodes falling back to In-house Sales. Migration to
Firestore uses stable legacy ids and per-row transactions against an
append-only `phoneIndex`, so duplicates are impossible, reruns are no-ops,
and conflicts exit non-zero instead of overwriting. Security rules require
sign-in for every operation, enforce an exact 12-field document shape,
recompute the dealer from the pincode server-side, and forbid client
updates/deletes. Testing spans 45 Python tests, 112 TypeScript unit tests,
and 30 emulator tests (auth, rules, repository, migration idempotency).
Trade-offs: no role system yet (all signed-in users are equal), leads stay
immutable for clients until a validated status-update path exists, and
local mode keeps submissions in memory only.
