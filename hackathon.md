# Hackathon log

- **Project:** MOVEOS
- **Event:** Convex All Gas Hackathon
- **What it does:** A live, approval-gated move operations coordinator that discovers affected work, records source evidence, and tracks dependencies, communications, and replies.
- **Live app:** https://groovy-cricket-986.convex.site
- **Repo:** https://github.com/Manikant92/MoveOS
- **Frontend:** Convex static hosting
- **Convex deployment:** https://groovy-cricket-986.convex.cloud
- **Components:** @convex-dev/migrations, @convex-dev/static-hosting
- **Convex features:** schema, indexes, queries, mutations, actions, scheduled functions, HTTP actions, realtime queries
- **Auth:** none
- **AI models:** gpt-5.6-luna
- **Started:** 2026-09-21T17:42:20Z
- **Last updated:** 2026-09-22T14:12:02Z

## Log

### 2026-09-21 - working tree
Initialized the public hackathon build log and selected Convex static hosting for
the future frontend. No application source or Convex project configuration exists yet.

### 2026-09-21 - 728eeba
Connected the workspace to the public MoveOS repository on `origin/main`. The
existing remote history contains only its initial README, with no product source yet.

### 2026-09-21 - working tree
Built MOVEOS as a React/Vite and Convex application. Added reactive move dashboards,
approval-gated task state, a dependency board, source evidence, activity history,
scheduled approval reminders, and idempotent AgentMail webhook handling
(`convex/schema.ts`, `convex/operations.ts`, `convex/integrations.ts`, `src/App.tsx`).
Configured server-side OpenAI, Firecrawl, and AgentMail actions with failure guards;
the local demo is explicitly simulated and did not send external mail.

### 2026-09-21 - working tree
Diagnosed missing provider configuration on the anonymous local Convex deployment
and added a retry action for failed research tasks, so Firecrawl work can be rerun
after `FIRECRAWL_API_KEY` is configured (`src/App.tsx`).

### 2026-09-22 - Phase 2 hardening (working tree)
Added structured location normalization for the India acceptance path (including
Hyderabad → Bengaluru), domestic/international classification, geography-scoped
Firecrawl queries, deterministic wrong-country rejection, OpenAI applicability
validation, context-versioned research, and stale-result protection. The dashboard
now counts only validated evidence as researched and exposes Impact Cascade, Needs
your input, and provenance panels. Root-context updates persist impact events and
mark affected tasks for review. Provider replies that report an unavailable
transfer now grow idempotent downstream cancellation, termination-fee, and
replacement-provider tasks. Existing approvals, demo guards, AgentMail webhook
deduplication, and failure-safe behavior were preserved.

The same working tree also hardened empty OpenAI evidence responses into a clear
research-incomplete state and restored the styled command-center dashboard after
a stylesheet regression. Production build and existing regression tests pass.

### 2026-09-22 - Phase 2 acceptance and deployment (working tree)
Completed the deterministic Phase 2 hardening pass: qualified Pune resolution,
17-domain domestic and 23-task international baselines, separate education and
healthcare tasks, context-bound evidence, stale-result invalidation, national
scope preservation, no-op cascade protection, atomic research-job deduplication,
provider questions, retrying automatic research, and landlord-role validation
(`convex/researchModel.ts`, `convex/researchQueue.ts`, `convex/operations.ts`,
`convex/integrations.ts`). Added 19 Convex acceptance tests plus the existing
workflow guards; all 22 tests and the production build pass.

Published the Vite frontend through Convex static hosting and deployed the
backend to the production Convex deployment. Registered the signed AgentMail
`message.received` webhook at `/agentmail/webhook`; the route was smoke-tested
with a synthetic event and the configured secret header. No secret values or
mailbox addresses are included in this log.

### 2026-09-22 - 97c6f01
Checked in the complete MOVEOS application snapshot: Convex backend, React/Vite
frontend, acceptance tests, deployment configuration, and a names-only
`.env.example`. The repository now contains the reproducible source for the
schema, queries, mutations, actions, HTTP webhook, scheduled functions,
realtime dashboard, research queue, and AgentMail integration; local secrets
and generated deployment state remain excluded.
