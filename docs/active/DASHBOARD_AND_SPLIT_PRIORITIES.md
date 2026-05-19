# PaperEdge — Forward Priority Plan

**Created:** 2026-05-19
**Status:** active — drives `/plan-orchestrate`
**Context:** P0 dashboard cleanup is complete (status taxonomy, trade-metrics, real chart data, Phase 8 9-card layout, status-set migration across pages). This plan covers what comes next, ranked by what unblocks the most downstream work.

Each step is sized to be a single `/orchestrate` chain. Steps are ordered by dependency — earlier steps must land before later steps in the same group.

---

## Step 1 — Decide and implement data-model boundary

Choose between **Approach 1** (extend `PaperTrade` with queue fields: `verificationStage`, `lockedAt`, `skippedAt`, `failedAt`, `failureReason`, `candidateExpectedProfitMin/Max`, `lockedExpectedProfitMin/Max`, `isLockedPaperTrade`) and **Approach 2** (add a separate `TradeOpportunity` model that `PaperTrade` is created from after lock).

Run an architecture proposal that weighs both against the codebase as it stands today, picks one, and writes a Prisma migration plus the model conversion helper (`lockOpportunityAsPaperTrade()` if Approach 2 is chosen). Migration must be reversible and must not touch existing rows' semantics.

Acceptance:
- A written ADR-style note in `docs/active/` explaining the decision and tradeoffs.
- `prisma/schema.prisma` updated and `prisma migrate dev --create-only` produces a clean migration.
- Migration applies cleanly on a fresh SQLite DB seeded with the existing seed.
- Any new TypeScript types are exported from `lib/`.

Out of scope: moving any verification/import routes — that happens in later steps.

---

## Step 2 — Stand up monorepo skeleton

Create `apps/dashboard`, `apps/verifier`, `packages/database`, `packages/core` workspace structure without moving any code yet. The current Next.js app stays at the repo root and keeps working. The new shells should be empty Next apps that share the existing Prisma client through `packages/database` and the existing `lib/calc.ts` / `lib/status.ts` / `lib/trade-metrics.ts` / `lib/dashboard-series.ts` through `packages/core`.

The repo uses npm; workspaces configuration goes in the root `package.json`. Both empty shells must `next build` successfully against the shared packages.

Acceptance:
- `package.json` declares `workspaces: ["apps/*", "packages/*"]`.
- `apps/dashboard` and `apps/verifier` each contain a minimal Next.js 16 app that imports a function from `packages/core` and renders.
- `packages/database` exports a `db` Prisma client wired to the same SQLite file the root app uses.
- `npm install` at the root resolves cleanly.

Out of scope: moving any routes from root into the new apps; that's Step 3.

---

## Step 3 — Migrate shared libs into packages/core and packages/database

Move `lib/calc.ts`, `lib/status.ts`, `lib/trade-metrics.ts`, `lib/dashboard-series.ts`, `lib/checklist.ts`, `lib/calculator-router.ts`, `lib/verify.ts`, `lib/fmt.ts`, `lib/constants.ts`, `lib/import-settlement.ts`, and their `.test.ts` files into `packages/core/src/`. Move `lib/db.ts` and the `prisma/` directory into `packages/database/`.

Update every import in the root app from `@/lib/<name>` to `@paperedge/core/<name>` (or whatever package name is chosen). Tests must still run.

Acceptance:
- `lib/` at the repo root contains only files that are actually app-specific (none, ideally).
- `npm test` from the root passes the same suites that passed before.
- Both `apps/dashboard` and `apps/verifier` shells still build.

Out of scope: any behavior change. Pure code motion.

---

## Step 4 — Move dashboard routes into apps/dashboard

Move `/`, `/pnl`, `/trades`, `/trades/[id]`, `/trades/[id]/settle`, `/settlement`, `/mistakes`, `/books`, `/books/manage`, `/settings`, `/api/export` from the root app into `apps/dashboard/app/`. Update navigation in `components/Sidebar.tsx` so dashboard nav no longer surfaces Import OddsJam or verification routes.

Verifier-only routes stay at the root for now (Step 5 moves them).

Acceptance:
- `apps/dashboard` renders the dashboard, P&L, trades journal, settlement, mistakes, books, and settings pages against the shared database.
- CSV export download still works.
- Root app no longer exposes the moved routes (404s are acceptable on root for now).

Out of scope: visual redesign; keep the styling as-is.

---

## Step 5 — Move verifier routes and Chrome extension into apps/verifier

Move `/trades/import` (rename to `/import`), `/trades/[id]/verify` (rename to `/verify/[id]`), `/books/[id]/deep-links`, `/api/trades/import`, `/api/trades/[id]/start-verification`, `/api/trades/[id]/verify-leg`, `/api/trades/active-verification`, `/api/deep-link`, and `extensions/paperedge-verifier/` into `apps/verifier/`.

Update the extension's `manifest.json`, `background.js`, and `content.js` to point at the verifier app's port and to whitelist the books in `ACTIVE_BOOKS` (currently the extension targets a stale list including theScore and missing several active books like Polymarket, Prophet X, BetOpenly, Onyx Odds, Betr).

Acceptance:
- `apps/verifier` renders the import, queue, verify, and deep-link admin pages.
- The Chrome extension's host_permissions and content_scripts.matches list match `ACTIVE_BOOKS` from `packages/core`.
- The extension's API calls succeed against `apps/verifier` running locally.

Out of scope: building the new dedicated verifier UI from Section 9 of the gap-review doc; that's Step 9.

---

## Step 6 — Add bankroll auto-update on settlement and BankrollSnapshot writes

Currently `BankrollSnapshot` is unused. When a trade is settled (`settleTrade()` server action in `apps/dashboard/app/trades/[id]/settle-actions.ts`), the action should:

1. Update `UserSettings.currentBankroll` by adding the settled `actualProfitLoss`.
2. Write a `BankrollSnapshot` row with `snapshotDate = now`, `currentBankroll`, and computed `dailyPL` / `weeklyPL` / `monthlyPL` aggregates.

Once snapshots exist, `buildBankrollSeries` in `packages/core` switches automatically from the reconstruction fallback to real snapshot data.

Acceptance:
- Settling a trade increments `currentBankroll` by exactly `actualProfitLoss`.
- A `BankrollSnapshot` row is written on every settlement with correct daily/weekly/monthly P/L.
- The dashboard bankroll chart sub-label says "snapshots" not "reconstructed from settled P/L" after any settlement.

Out of scope: deposits, withdrawals, manual bankroll adjustments — those are a later feature.

---

## Step 7 — Implement date-range filter on dashboard

Wire the existing `7D / 30D / 90D / YTD` buttons in `apps/dashboard/app/page.tsx` to a real `?range=` query parameter. Add `packages/core/date-ranges.ts` that exports a `resolveRange(range: string): { start: Date; end: Date }` helper. Every KPI card and chart should respect the resolved window.

Acceptance:
- `/?range=7d`, `/?range=30d`, `/?range=90d`, `/?range=ytd`, `/?range=all` all render distinct numbers.
- The active range button is visually highlighted.
- KPIs in the Performance, Process Discipline, and Bankroll Mechanics rows all honor the window.

Out of scope: range filtering on other pages; this step is dashboard-only.

---

## Step 8 — Add Data Quality Warnings panel to dashboard

New dashboard section that flags rows where the data is internally inconsistent:

- locked/settled trade with no legs;
- settled trade with no `Result`;
- `Result` with no `actualProfitLoss`;
- trade with status not recognized by `lib/status.ts` (`statusGroup(s) === "unknown"`);
- locked-open trade with no `totalStakeExposure`;
- imported trade with raw `oddsjamSnapshotJson` that was never parsed into structured fields.

Each warning row should link to the offending trade and explain the issue in one sentence.

Acceptance:
- Panel renders even when there are zero warnings ("All clear" empty state).
- Each warning type is unit-testable as a pure function on a trade row.
- No data is mutated by this panel — read-only.

Out of scope: auto-repair flows.

---

## Step 9 — Build verifier app's dedicated queue UI

`apps/verifier` currently inherits the old wizard-style verify pages. Replace them with the queue model from the gap-review doc:

- `/` shows queue overview grouped by `verificationStage` (or status group, depending on Step 1's outcome).
- `/import` (already exists, validate it still works post-move).
- `/verify` lists every queued opportunity grouped by status.
- `/verify/[id]` is the step-by-step verification page.
- `/locked` shows recently locked paper trades (read-only).
- `/skipped` shows skipped / failed opportunities with the failure reason.

The flow should make it cheap to lock a verified opportunity into a `PaperTrade` row (using the helper from Step 1).

Acceptance:
- All five routes render against real data from `packages/database`.
- Locking an opportunity creates a `PaperTrade` and transitions the source row to a locked/archived state per Step 1's data model.
- Failed verification reasons are visible on the `/skipped` page and don't appear on the dashboard's open-trade counts.

Out of scope: redesigning the trade entry form; keep the existing UI components and just route them through the queue model.

---

## Step 10 — Add Verification Funnel and per-book pass rate to verifier app

Per Section 3.4 of the gap-review doc, this is the highest-value report. Build it on the **verifier app**, not the dashboard. The dashboard should only carry a single "Verification Health" KPI summarizing pass rate over the selected window.

Funnel buckets: imported, queued for verification, verifying, verified, ready to lock, locked, failed verification, skipped, settlement pending, settled.

Per-book table columns: attempts, verified, pass rate, odds-moved count, line-moved count, market-unavailable count.

Acceptance:
- Funnel and per-book table render against last-30-days data by default with a window selector.
- Numbers reconcile: sum of bucket counts equals total opportunities imported in the window.
- Dashboard gains one KPI card summarizing verification pass rate; clicking it links to the verifier app's funnel page.

Out of scope: cross-app navigation polish (deep-linking between apps is a later concern).

---

## Step 11 — Archive legacy build docs

Move `docs/CLAUDE_CODE_KICKOFF_PROMPT.md`, `docs/PAPEREDGE_BUILD_HANDOFF.md`, `docs/PAPEREDGE_BUILD_PLAN.md`, `docs/PAPEREDGE_VERIFICATION_ADDENDUM.md`, and `docs/PAPEREDGE_PREFILL_AND_EXTENSION_ADDENDUM.md` into `docs/archive/2026-05-19-build-handoff/`. Add a one-line archive header to each:

> Archived build spec. Kept for history only. Current source of truth is `docs/active/`.

Acceptance:
- All five files relocated, headers added, originals deleted (not duplicated).
- `git mv` is used so history follows the rename.
- `docs/active/` contains at least this plan and the Step 1 ADR.

Out of scope: rewriting the archived docs to reflect current state — they are frozen.
