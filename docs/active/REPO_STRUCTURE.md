# PaperEdge Repo Structure

**Status:** active
**Updated:** 2026-05-19

This repo is mid-split from a single root Next.js app into a small npm workspace.

## Current Layout

- `app/` - Existing root Next.js app. Still contains all production routes until Steps 4 and 5 move them.
- `apps/dashboard/` - Empty dashboard shell added in Step 2. It imports shared packages and builds, but dashboard routes have not moved here yet.
- `apps/verifier/` - Empty verifier shell added in Step 2. It imports shared packages and builds, but verifier routes and the Chrome extension have not moved here yet.
- `components/` - Existing root UI components used by the root app.
- `lib/` - Existing shared and root-app logic. Step 3 will move shared modules into `packages/core`.
- `packages/core/` - Workspace package for shared calculation/status/reporting logic. Currently re-exports selected root `lib/` modules until Step 3 performs the real move.
- `packages/database/` - Workspace package for Prisma access. It resolves the repo-root SQLite file at `prisma/dev.db`.
- `prisma/` - Existing schema, migrations, and seed data. Step 3 will move this into `packages/database`.
- `extensions/paperedge-verifier/` - Existing Chrome extension. Step 5 will move it into `apps/verifier`.
- `docs/active/` - Current source of truth for plans and decisions.
- `docs/archive/` - Frozen historical specs.

## Current Committed Milestones

- Step 1: `TradeOpportunity` model, migration, ADR, and lock helper landed in `b7b7dae`.
- Step 2: npm workspace skeleton, app shells, and package shells landed in `f1af979`.
- Step 11: legacy build docs archived in `c149dc2`.

## Next Planned Work

Step 3 is next:

- Move shared `lib/` modules and tests into `packages/core/src/`.
- Move `lib/db.ts` and `prisma/` into `packages/database/`.
- Update imports from `@/lib/...` to `@paperedge/core/...` or `@paperedge/database`.
- Verify root app plus both workspace app shells still build.
