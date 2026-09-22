# Phase 2 correctness acceptance — 22 September 2026

Scope: existing MOVEOS application, existing local Convex deployment. No redesign, external messages, production deployment, or commits.

## Verification

- `npm test`: 22 passing tests (19 Convex integration/regression tests plus 3 existing workflow guards).
- `npm run build`: passed.
- `npx tsc --noEmit -p convex/tsconfig.json`: passed.
- Existing Convex watcher pushed the functions and migrations component successfully.
- `migrations:repairPhase2`: completed; three existing non-demo moves repaired, demo preserved. Superseded records were archived, not deleted.
- Browser: existing stylesheet renders; normalized locations, Verified metric and separate research statuses are present.

## Acceptance matrix

| Criterion | Result | Evidence |
|---|---|---|
| Pune resolution | PASS | Qualified and alias normalization tests; fresh and persisted Pune resolve to Maharashtra, India, DOMESTIC. |
| Domestic baseline | PASS | 17 domains/tasks returned immediately after creation, without awaiting research. |
| Child-specific education | PASS | Child household creates applicable education; zero-child household marks it not applicable. |
| Healthcare separation | PASS | Independent education and healthcare task identities; combined legacy task archived. |
| Stale evidence invalidation | PASS | Both destination-change directions tested; stale evidence excluded in backend and retained historically. |
| Verified-count correctness | PASS | Backend counts only distinct tasks with accepted applicable evidence; stale, superseded and unvalidated fixtures excluded. |
| National-evidence preservation | PASS | Source-validated national fixture survives Pune–Bengaluru–Pune; country change invalidates it. |
| No-op cascade prevention | PASS | Full dashboard and jobs unchanged in regression test; fresh local no-op causes no version/cascade increment. |
| Research-job deduplication | PASS | Repeated requests and concurrent dispatch tests; zero duplicate active keys in local acceptance. |
| Needs-information behavior | PASS | Fresh moves each have two provider questions; unresolved geography blocks research; supplying provider auto-queues. |
| Automatic research queue | PASS | Scheduled worker tests drain queues without clicks; live scheduler and fresh moves show completed attempts and continuing work. |
| London international baseline | PASS | Fresh qualified London move is INTERNATIONAL with 23 tasks. |
| International task deduplication | PASS | Unique stable identities; one education and one healthcare task; legacy repair regression. |
| Housing role relevance | PASS | Landlord-only GOV.UK source excluded and old evidence marked stale; mocked tenant-source extraction accepted. |
| Firecrawl-failure resilience | PASS | Mocked 400 and 429 failures; bounded retries for both cities; checklist remains present and actionable. |

National-policy fixtures and forced external failures were tested in isolated convex-test databases, not inserted into real user moves. PASS does not mean every external research query finds a verified requirement.

## Fresh local moves

Pune: `jx734e1dzzzagfg5ynwj6tw5bx8ex0qn`, 10 October 2026, two adults and one child. Created fresh in this acceptance run. An interrupted CLI null-response parser was fixed and checks resumed on this same newly-created move.

London: `jx7fasq1dks9hee16vsck4kww98exc65`, 26 October 2026, two adults and one child. Created fresh in this acceptance run.

Pune initially auto-queued 15 eligible jobs; London 21. Each has two provider-input questions. Pune–Bengaluru–Pune produced exactly two root changes and two cascades. All checked queue snapshots had zero duplicate active keys.

Last local snapshot, approximately 15:51 IST:

| Move | Tasks | Verified | Needs information | Queued | Searching | Research incomplete |
|---|---:|---:|---:|---:|---:|---:|
| Pune | 17 | 0 | 2 | 9 | 0 | 6 |
| London | 23 | 1 | 2 | 15 | 1 | 4 |

London's accepted source at this snapshot was GOV.UK school-applications guidance for foreign national children, applicable to London, England, United Kingdom. Research remains asynchronous; these counts will change. No fabricated evidence was added to the local moves.

## All domains and generated tasks

The first 17 rows are generated for BOTH moves; London additionally has the final six rows.

| Domain considered | Task | Pune | London |
|---|---|:---:|:---:|
| HOUSING | Destination housing | Yes | Yes |
| MOVING_LOGISTICS | Moving logistics | Yes | Yes |
| ELECTRICITY | Electricity — origin close-out | Yes | Yes |
| WATER_GAS_UTILITIES | Water and gas utilities | Yes | Yes |
| BROADBAND | Broadband — transfer or replacement | Yes | Yes |
| TELECOM | Mobile and telecom | Yes | Yes |
| FINANCIAL | Financial accounts — address updates | Yes | Yes |
| INSURANCE | Insurance — address update | Yes | Yes |
| EMPLOYMENT_PAYROLL | Employment and payroll | Yes | Yes |
| HEALTHCARE | Healthcare / medical continuity | Yes | Yes |
| EDUCATION | Education / school transition | Yes | Yes |
| GOVERNMENT_ADMIN | Government and identity records | Yes | Yes |
| ADDRESS_CHANGE | Address changes | Yes | Yes |
| TRANSPORT_VEHICLE | Vehicle and transport | Yes | Yes |
| SUBSCRIPTIONS_SERVICES | Subscriptions and deliveries | Yes | Yes |
| IMPORTANT_DOCUMENTS | Important documents | Yes | Yes |
| FAMILY_CHILD | Family and child arrangements | Yes | Yes |
| IMMIGRATION | Immigration — right to reside | — | Yes |
| TRAVEL_DOCUMENTS | Travel documents | — | Yes |
| CUSTOMS | Customs — household goods | — | Yes |
| TRAVEL | Travel and arrival plan | — | Yes |
| CROSS_BORDER_FINANCE | Cross-border finance | — | Yes |
| TAX_ADMIN | Tax and destination registration | — | Yes |

## Files

- `convex/location.ts`: qualified-input normalization.
- `convex/researchModel.ts`: deterministic baseline, context-bound evidence checks and transactional enqueue/reconciliation.
- `convex/researchQueue.ts`: atomic claim, priority, lease recovery, retry fencing and diagnostics.
- `convex/operations.ts`: immediate creation, canonical no-op guard, single cascades, backend Verified metric and stale-action guards.
- `convex/integrations.ts`: bounded fetches, official-source screening, role/scope extraction, token-fenced result writes.
- `convex/migrations.ts`: resumable legacy repair.
- `tests/phase2.test.ts`: deterministic acceptance and failure cases.
- `tests/local-acceptance.mjs`: explicitly invoked local-only fresh-move smoke checks (not part of npm test).

Local development: http://127.0.0.1:5173/
