# PostgreSQL Migration Hardening Plan

## Status

- Production Container App is running successfully on PostgreSQL.
- The migration crash loop has been resolved for the current startup path.
- Pairing now works again with a fresh token from the latest revision logs.
- The remaining work is preventative: stop SQLite-only migration assumptions from returning.

## Why this exists

We already fixed several production blockers by making older migrations PostgreSQL-safe. That solved the outage, but the pattern is still risky because a future migration can reintroduce a SQLite-only SQL assumption and fail only at deploy time.

This plan turns the current emergency recovery work into a stable release process.

## Needed work

1. Batch-audit all server migrations for SQLite-only SQL.
1. Fix any remaining PRAGMA-based introspection, SQLite-only JSON behavior, or non-portable insert syntax.
1. Keep PostgreSQL as the production migration dialect and only branch to SQLite when local compatibility is truly required.
1. Add a migration-from-zero verification step before release so portability issues fail earlier.
1. Keep the current production image and ACA configuration stable while the cleanup is completed.

## Recommended implementation order

### Phase 1: Commit the current production fix set

1. Commit the migration portability fixes already applied.
1. Update the pull request so the running hosted deployment matches the repo state.
1. Leave the app running while this commit is prepared.

### Phase 2: Batch portability sweep

1. Audit the remaining migration files for SQLite-specific patterns.
1. Convert any remaining `PRAGMA table_info(...)` usage to PostgreSQL-safe schema introspection.
1. Check for SQLite-only `INSERT OR IGNORE` or JSON aggregate assumptions and replace them with portable or PostgreSQL-safe equivalents.
1. Prefer fixing multiple migrations in one pass instead of one deploy at a time.

### Phase 3: Add guardrails

1. Add a check that runs the full migration chain against PostgreSQL from an empty database.
1. Keep `vp run typecheck` and `vp check` as mandatory pre-release gates.
1. Add a short release checklist for ACA: build image, replace app, verify revision, inspect logs.

### Phase 4: Document the rule

1. Write down that new server migrations must be PostgreSQL-valid first.
1. Allow SQLite support only as explicit compatibility code, not as an accidental default.
1. Keep the compatibility layer small and deliberate.

## When to implement

- Immediately for the repo commit and PR update.
- In the next cleanup pass after the current deployment is confirmed stable.
- Before any new server migration lands.

## Success criteria

1. The current deployed revision stays healthy.
1. The PR reflects the actual running state.
1. Future migrations do not break startup on PostgreSQL.
1. The release process includes an early migration compatibility check.
