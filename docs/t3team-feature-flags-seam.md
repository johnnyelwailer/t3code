# Main-repository feature flag integration seam

This checkout has no PostgreSQL-backed feature-flag framework or Admin feature-flag UI.
Evidence: `rg -n 'feature_flags|PgClient|@effect/sql-pg|DATABASE_URL|postgres|AdminSettings|admin.settings'`
found PostgreSQL only in `infra/relay`, not in the app server. Before this change,
`feature_flags` had no matches. The web Beta settings use local storage. App server
persistence is SQLite (`apps/server/src/persistence/Layers/Sqlite.ts`).

The missing-framework seam consists of:

- `packages/project-context/src/t3teamFeatureFlags.ts`: registered MAIN_REPOSITORY and
  NEXI_STATE_DIR definitions, env > DB snapshot > code default (both default off).
- `apps/server/src/persistence/Migrations/t3team-063_FeatureFlags.ts`: portable
  PostgreSQL/SQLite `feature_flags` DDL; registered as migration **81**, following 80.
- `apps/server/src/t3team-featureFlagStore.ts`: parameterized SQL read/write and startup
  initialization APIs using the host-provided Effect SqlClient. No new DB runtime.

The distribution PostgreSQL startup adapter must provide its existing SqlClient and run
`initializeFeatureFlags` **before importing modules that resolve PROJECT_STATE_DIR**.
MAIN_REPOSITORY reads the current snapshot each call; authorized Admin writes must use
`setFeatureFlag`, which persists then refreshes it. External writes need
`refreshFeatureFlags` before they affect this process. There is no implicit DB polling.

The missing Admin UI/transport must authenticate and authorize writes, expose two switches
using `registeredFeatureFlags`, call `setFeatureFlag`, and publish refreshed ServerConfig.
Show the effective env override (which wins over saved DB values). MAIN_REPOSITORY applies
immediately. NEXI_STATE_DIR must display **“Changes apply on the next server start”**;
PROJECT_STATE_DIR and the advertised startup selection stay fixed during the process.

The seam is tested against the existing in-memory SQLite client. A real PostgreSQL adapter
and authenticated Admin client still need integration verification in the distribution host.
