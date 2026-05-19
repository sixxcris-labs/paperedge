# ADR-001 — Separate `TradeOpportunity` from `PaperTrade`

**Status:** accepted
**Date:** 2026-05-19
**Plan reference:** [DASHBOARD_AND_SPLIT_PRIORITIES.md](./DASHBOARD_AND_SPLIT_PRIORITIES.md) Step 1

---

## Context

The current `PaperTrade` model is a god-object spanning four logical lifecycles:

1. **Candidate** — pasted from OddsJam, unverified.
2. **Verification queue** — book-by-book line checks in progress.
3. **Locked paper trade** — real paper exposure, awaiting event.
4. **Settled** — terminal outcome.

The status column already carries 23 distinct strings to disambiguate these states (see [lib/status.ts](../../lib/status.ts)). Every dashboard query has to filter by status group to ignore states it doesn't care about. The verifier app, which is about to live in `apps/verifier/`, needs an even richer operational vocabulary — `imported`, `queued_for_verification`, `verifying_book_a`, `book_a_verified`, `market_match_confirmed`, `stake_recalculated`, `ready_to_lock`, failure reasons, etc. Cramming that into `PaperTrade.status` plus a handful of boolean flags makes both apps harder to reason about.

The split-app architecture (dashboard reads / verifier writes operational state) is the reason this decision is being made now: the boundary between "what the dashboard cares about" and "what the verifier cares about" maps cleanly onto two separate tables.

## Decision

**Add a new `TradeOpportunity` model.** `PaperTrade` rows are created only when an opportunity is locked. The two tables are linked by `TradeOpportunity.lockedTradeId → PaperTrade.id`.

The verifier app owns `TradeOpportunity` end-to-end. The dashboard never queries it directly except for a single "Verification Health" KPI (per Step 10 of the plan).

The conversion is encapsulated in one helper: `lockOpportunityAsPaperTrade(opportunityId)` in `lib/lock-opportunity.ts`. The helper runs inside a Prisma transaction so the `PaperTrade` write and the opportunity's status transition land atomically.

## Alternatives considered

### Approach 1 — Extend `PaperTrade` with queue fields

Add `verificationStage`, `lockedAt`, `skippedAt`, `failedAt`, `failureReason`, `candidateExpectedProfitMin/Max`, `lockedExpectedProfitMin/Max`, `isLockedPaperTrade`, plus 12+ book-level verification fields, all on `PaperTrade`.

**Rejected** because:
- Doubles down on the god-object pattern just as we're splitting it apart for clarity.
- Dashboard queries become more brittle: every aggregate must remember to filter on `isLockedPaperTrade = true` or risk pulling candidate rows into "money at risk" totals.
- The verifier app and dashboard would share one table with two divergent purposes, defeating the purpose of the app split.
- No migration cost saving — adding 20+ nullable columns to `PaperTrade` is functionally the same work as a new table.

### Approach 2 — `TradeOpportunity` + `PaperTrade` (chosen)

Two tables, one helper, clear ownership.

**Accepted** because:
- Dashboard queries against `PaperTrade` alone are by construction "trades that mattered enough to lock". No `isVisibleOnDashboard` predicate needed at the table level.
- The verifier app can evolve its operational vocabulary without touching `PaperTrade`.
- Locked trade history stays clean: a locked `PaperTrade` is a contract — its row never reverts to "unverified".
- One conversion point (the lock helper) is easier to audit than dozens of branches checking "is this trade past the lock gate?".

### No structural change

**Rejected.** The status enum already has 23 values and is growing. The pain is real and present.

## Consequences

### Positive

- Dashboard queries get simpler immediately. The `isVisibleOnDashboard` predicate becomes redundant against `PaperTrade` (it still applies if any non-locked rows are ever inserted — e.g. manual entry pre-verification — but that's caller intent, not table-shape).
- Verifier-app development is unblocked. Steps 9 and 10 of the plan can model queue state freely.
- Status taxonomy on `PaperTrade` narrows to {`paper_traded`, `pending_result`, `settled_won` / `settled_lost` / `settled_push` / `settled_partial`, `mistake_invalid`, `cancelled`, plus the manual-flow `locked_paper_trade*` / `settled_win/loss/push_void` aliases for back-compat}. Candidate / failed-verification states move to `TradeOpportunity`.
- `BookDeepLink` and `TradeLeg` keep referencing `PaperTrade`. No churn there.

### Negative

- One conversion point — `lockOpportunityAsPaperTrade()` — is now a critical-path function. It must be transactional and well-tested.
- Migration is not zero-cost: the new table needs to be created, and any existing rows in `PaperTrade` with non-locked statuses arguably should be backfilled as `TradeOpportunity` rows. **Mitigation:** this is a single-user pre-production app with throwaway dev data. The migration creates the new table and leaves existing `PaperTrade` rows alone. No backfill.
- The import API (`/api/trades/import`) currently creates a `PaperTrade` row directly. It needs to create a `TradeOpportunity` row instead, post-split. **Mitigation:** this is part of Step 5 (move verifier routes) — the import route gets rewritten when it moves.
- Two tables to keep in sync if a locked opportunity needs to be un-locked. **Mitigation:** un-locking is not a supported flow. Cancel the `PaperTrade`, mark the `TradeOpportunity` as `skipped`. Two writes, both auditable.

### Neutral

- `lib/status.ts` predicates continue to work — they don't care which table a row came from. The `CANDIDATE`, `READY_TO_LOCK`, and `FAILED_VERIFICATION` groups will rarely be queried against `PaperTrade` after this lands, but the predicates remain useful for the verifier app and for any legacy rows.

## Schema (delta against current `prisma/schema.prisma`)

```prisma
model TradeOpportunity {
  id                   String   @id @default(uuid())
  userId               String
  user                 User     @relation(fields: [userId], references: [id])

  // Lifecycle
  status               String   @default("imported")
  // imported | queued_for_verification | verifying_book_a | book_a_verified |
  // verifying_book_b | book_b_verified | market_match_confirmed |
  // stake_recalculated | ready_to_lock | locked | skipped |
  // failed_odds_changed | failed_line_changed | failed_market_mismatch |
  // failed_low_liquidity | failed_stake_not_accepted | failed_other
  source               String   @default("oddsjam_paste")
  // oddsjam_paste | oddsjam_csv | manual

  rawEntryText         String?
  importedAt           DateTime @default(now())
  verifiedAt           DateTime?
  lockedAt             DateTime?
  skippedAt            DateTime?
  failedAt             DateTime?
  failureReason        String?
  notes                String?

  // Link to the locked PaperTrade once promoted. Null until lock.
  lockedTradeId        String?  @unique
  lockedTrade          PaperTrade? @relation("OpportunityLock", fields: [lockedTradeId], references: [id])

  // Market identity
  tradeType            String   @default("cash_arbitrage")
  event                String
  startTime            DateTime?
  sport                String   @default("unknown")
  league               String?
  market               String   @default("moneyline")
  playerOrTeam         String?
  period               String   @default("full_game")

  // Book A — expected (from import) and observed (from verifier)
  bookAId              String?
  bookA                Book?    @relation("OpportunityBookA", fields: [bookAId], references: [id])
  sideA                String?
  oddsA                Int?
  lineA                Float?
  stakeA               Float?
  liquidityA           Float?
  verifiedOddsA        Int?
  verifiedLineA        Float?
  verifiedLiquidityA   Float?
  bookANotes           String?
  bookAVerified        Boolean  @default(false)

  // Book B
  bookBId              String?
  bookB                Book?    @relation("OpportunityBookB", fields: [bookBId], references: [id])
  sideB                String?
  oddsB                Int?
  lineB                Float?
  stakeB               Float?
  liquidityB           Float?
  verifiedOddsB        Int?
  verifiedLineB        Float?
  verifiedLiquidityB   Float?
  bookBNotes           String?
  bookBVerified        Boolean  @default(false)

  // Market-match checks
  sameEventConfirmed         Boolean @default(false)
  sameMarketConfirmed        Boolean @default(false)
  samePlayerOrTeamConfirmed  Boolean @default(false)
  samePeriodConfirmed        Boolean @default(false)
  sameLineConfirmed          Boolean @default(false)
  oppositeSidesConfirmed     Boolean @default(false)
  oddsAcceptedConfirmed      Boolean @default(false)
  stakeAcceptedConfirmed     Boolean @default(false)
  liquidityEnoughConfirmed   Boolean @default(false)
  recalculatedConfirmed      Boolean @default(false)
  userFinalConfirm           Boolean @default(false)

  // Computed at import + refined post-verification
  totalExposure        Float?
  profitIfAWins        Float?
  profitIfBWins        Float?
  expectedProfitMin    Float?
  expectedProfitMax    Float?

  // Middle-trade specifics (null for non-middles)
  middleDistance       Float?
  middleNumber         Float?
  middleRange          String?
  outsideLoss          Float?
  middleProfit         Float?

  createdAt            DateTime @default(now())
  updatedAt            DateTime @updatedAt

  @@index([userId, status])
  @@index([userId, importedAt])
}
```

Required additions to existing models:

```prisma
model PaperTrade {
  // ... existing fields unchanged
  lockedFromOpportunity TradeOpportunity? @relation("OpportunityLock")
}

model Book {
  // ... existing fields unchanged
  opportunitiesAsA TradeOpportunity[] @relation("OpportunityBookA")
  opportunitiesAsB TradeOpportunity[] @relation("OpportunityBookB")
}

model User {
  // ... existing fields unchanged
  opportunities TradeOpportunity[]
}
```

## Migration plan

1. **Schema update** (this commit) — `prisma/schema.prisma` updated as above.
2. **Migration SQL** (this commit) — `prisma/migrations/20260519XXXXXX_add_trade_opportunity/migration.sql` created with `CREATE TABLE TradeOpportunity` and indexes. Written by hand because `npm install` has not been run in this environment; once deps are installed the user can verify with `npx prisma migrate dev --create-only` and the auto-generated SQL should match.
3. **Lock helper** (this commit) — `lib/lock-opportunity.ts` exports `lockOpportunityAsPaperTrade(db, opportunityId)`. Runs in a transaction: creates a `PaperTrade` from the opportunity's verified fields, sets `opportunity.status = "locked"`, sets `opportunity.lockedTradeId = paperTrade.id`, sets `opportunity.lockedAt = now`. Returns the new `PaperTrade.id`.
4. **Import route rewrite** (deferred to Step 5) — `/api/trades/import` will write a `TradeOpportunity` instead of a `PaperTrade` once it moves to `apps/verifier`. Until then, the existing route continues writing `PaperTrade` rows with `status = "unverified"`; those rows are read by the existing verify page. This is intentional: Step 1 introduces the model without forcing a same-PR rewrite of the import flow.
5. **No backfill.** Existing dev rows in `PaperTrade` stay as-is. Pre-production single-user app; no production data to migrate.

## Open questions deferred to later steps

- **Step 5:** Should the import API write directly to `TradeOpportunity`, or should there be a separate `/api/opportunities/import` route? Recommendation: the latter — cleaner separation, and the verifier app owns the new model.
- **Step 9:** How does the verifier's `/verify/[id]` page route — by `TradeOpportunity.id` or by a derived short code? Recommendation: opportunity id; short codes can be added later if URLs get unwieldy.
- **Step 10:** Where does the Verification Funnel pull its counts from? Now obvious: `TradeOpportunity` grouped by `status`. The dashboard's "Verification Health" KPI calls a shared aggregation helper in `packages/core`.
