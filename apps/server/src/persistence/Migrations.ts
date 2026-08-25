/**
 * MigrationsLive - Migration runner with inline loader
 *
 * Uses Migrator.make with fromRecord to define migrations inline.
 * All migrations are statically imported - no dynamic file system loading.
 *
 * Migrations run automatically when the MigrationLayer is provided,
 * ensuring the database schema is always up-to-date before the application starts.
 */

import * as Migrator from "effect/unstable/sql/Migrator";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

// Import all migrations statically
import Migration0001 from "./Migrations/001_OrchestrationEvents.ts";
import Migration0002 from "./Migrations/002_OrchestrationCommandReceipts.ts";
import Migration0003 from "./Migrations/003_CheckpointDiffBlobs.ts";
import Migration0004 from "./Migrations/004_ProviderSessionRuntime.ts";
import Migration0005 from "./Migrations/005_Projections.ts";
import Migration0006 from "./Migrations/006_ProjectionThreadSessionRuntimeModeColumns.ts";
import Migration0007 from "./Migrations/007_ProjectionThreadMessageAttachments.ts";
import Migration0008 from "./Migrations/008_ProjectionThreadActivitySequence.ts";
import Migration0009 from "./Migrations/009_ProviderSessionRuntimeMode.ts";
import Migration0010 from "./Migrations/010_ProjectionThreadsRuntimeMode.ts";
import Migration0011 from "./Migrations/011_OrchestrationThreadCreatedRuntimeMode.ts";
import Migration0012 from "./Migrations/012_ProjectionThreadsInteractionMode.ts";
import Migration0013 from "./Migrations/013_ProjectionThreadProposedPlans.ts";
import Migration0014 from "./Migrations/014_ProjectionThreadProposedPlanImplementation.ts";
import Migration0015 from "./Migrations/015_ProjectionTurnsSourceProposedPlan.ts";
import Migration0016 from "./Migrations/016_CanonicalizeModelSelections.ts";
import Migration0017 from "./Migrations/017_ProjectionThreadsArchivedAt.ts";
import Migration0018 from "./Migrations/018_ProjectionThreadsArchivedAtIndex.ts";
import Migration0019 from "./Migrations/019_ProjectionSnapshotLookupIndexes.ts";
import Migration0020 from "./Migrations/020_AuthAccessManagement.ts";
import Migration0021 from "./Migrations/021_AuthSessionClientMetadata.ts";
import Migration0022 from "./Migrations/022_AuthSessionLastConnectedAt.ts";
import Migration0023 from "./Migrations/023_ProjectionThreadShellSummary.ts";
import Migration0024 from "./Migrations/024_BackfillProjectionThreadShellSummary.ts";
import Migration0025 from "./Migrations/025_CleanupInvalidProjectionPendingApprovals.ts";
import Migration0026 from "./Migrations/026_CanonicalizeModelSelectionOptions.ts";
import Migration0027 from "./Migrations/027_ProviderSessionRuntimeInstanceId.ts";
import Migration0028 from "./Migrations/028_ProjectionThreadSessionInstanceId.ts";
import Migration0029 from "./Migrations/029_ProjectionThreadDetailOrderingIndexes.ts";
import Migration0030 from "./Migrations/030_ProjectionThreadShellArchiveIndexes.ts";
import Migration0031 from "./Migrations/031_AuthAuthorizationScopes.ts";
import Migration0032 from "./Migrations/032_AuthPairingProofKeyThumbprint.ts";
import Migration0033 from "./Migrations/t3team-033_ProjectionThreadMessageT3TeamExt.ts";
import Migration0034 from "./Migrations/t3team-034_WorkflowDurability.ts";
import Migration0035 from "./Migrations/t3team-035_WorkflowScheduler.ts";
import Migration0036 from "./Migrations/t3team-036_AtlassianMirrorColumns.ts";
import Migration0037 from "./Migrations/t3team-037_BackfillAssigneeAccountId.ts";
import Migration0038 from "./Migrations/t3team-038_BacklogQuickFilters.ts";
import Migration0039 from "./Migrations/t3team-039_WorkflowOrigin.ts";
import Migration0040 from "./Migrations/t3team-040_ProjectionThreadMessageSequence.ts";
import Migration0041 from "./Migrations/t3team-041_ProjectionThreadRetention.ts";
import Migration0042 from "./Migrations/t3team-042_ProjectionThreadChildStatus.ts";
// Upstream added these as 033/034, but this fork already occupies 33-42. The runner only
// applies migrations with an id greater than the last applied one, so re-using 33/34 would
// silently skip them on every existing fork database. They keep their upstream filenames and
// contents; only the registered id moves. Rule for future syncs: append upstream migrations
// above the fork's current maximum id instead of renumbering fork migrations.
import Migration0043 from "./Migrations/033_ProjectionThreadsSettled.ts";
import Migration0044 from "./Migrations/034_ProjectionThreadsSnoozed.ts";
// This branch's own migrations. They were authored as 043/044 before main took those ids; by
// main's rule above the ESTABLISHED ids win and the newcomer appends, so they moved to 045/046.
// Safe here because they had only ever been applied on this branch's throwaway dev databases —
// both are plain ADD COLUMN and would fail if re-applied to a database that ran them as 043/044.
import Migration0045 from "./Migrations/t3team-045_WorkflowRecipePath.ts";
import Migration0046 from "./Migrations/t3team-046_WorkflowFailureReason.ts";
import Migration0047 from "./Migrations/t3team-047_WorkflowHostToolGrant.ts";
import Migration0048 from "./Migrations/t3team-048_ProjectSourceBindings.ts";
// Same rule again for the 2026-08 sync: upstream landed 035-038, but 35-38 are already taken on
// every fork database, so these keep their upstream filenames and append above the fork's maximum.
import Migration0049 from "./Migrations/035_ProjectionThreadTitleRegeneration.ts";
import Migration0050 from "./Migrations/036_ProjectionThreadsPinned.ts";
import Migration0051 from "./Migrations/037_ProjectionTurnsKeysetIndex.ts";
import Migration0052 from "./Migrations/038_ProjectionThreadsPinOrderKey.ts";
// New from the 2026-08-09 upstream sync (upstream 039/040). Appended above the fork's maximum id
// rather than taking upstream's numbers, which this fork already uses — see the rule above.
import Migration0053 from "./Migrations/039_ProjectionProjectsDefaultThreadEnvMode.ts";
import Migration0054 from "./Migrations/040_ProjectionProjectFaviconPath.ts";
// New from the 2026-08-25 upstream sync (upstream 041/042). Appended above the fork's maximum id
// rather than taking upstream's numbers, which this fork already uses — see the rule above.
import Migration0055 from "./Migrations/041_AuthSessionClientConnection.ts";
import Migration0056 from "./Migrations/042_ProjectionThreadLinkedPullRequest.ts";

/**
 * Migration loader with all migrations defined inline.
 *
 * Key format: "{id}_{name}" where:
 * - id: numeric migration ID (determines execution order)
 * - name: descriptive name for the migration
 *
 * Uses Migrator.fromRecord which parses the key format and
 * returns migrations sorted by ID.
 */
export const migrationEntries = [
  [1, "OrchestrationEvents", Migration0001],
  [2, "OrchestrationCommandReceipts", Migration0002],
  [3, "CheckpointDiffBlobs", Migration0003],
  [4, "ProviderSessionRuntime", Migration0004],
  [5, "Projections", Migration0005],
  [6, "ProjectionThreadSessionRuntimeModeColumns", Migration0006],
  [7, "ProjectionThreadMessageAttachments", Migration0007],
  [8, "ProjectionThreadActivitySequence", Migration0008],
  [9, "ProviderSessionRuntimeMode", Migration0009],
  [10, "ProjectionThreadsRuntimeMode", Migration0010],
  [11, "OrchestrationThreadCreatedRuntimeMode", Migration0011],
  [12, "ProjectionThreadsInteractionMode", Migration0012],
  [13, "ProjectionThreadProposedPlans", Migration0013],
  [14, "ProjectionThreadProposedPlanImplementation", Migration0014],
  [15, "ProjectionTurnsSourceProposedPlan", Migration0015],
  [16, "CanonicalizeModelSelections", Migration0016],
  [17, "ProjectionThreadsArchivedAt", Migration0017],
  [18, "ProjectionThreadsArchivedAtIndex", Migration0018],
  [19, "ProjectionSnapshotLookupIndexes", Migration0019],
  [20, "AuthAccessManagement", Migration0020],
  [21, "AuthSessionClientMetadata", Migration0021],
  [22, "AuthSessionLastConnectedAt", Migration0022],
  [23, "ProjectionThreadShellSummary", Migration0023],
  [24, "BackfillProjectionThreadShellSummary", Migration0024],
  [25, "CleanupInvalidProjectionPendingApprovals", Migration0025],
  [26, "CanonicalizeModelSelectionOptions", Migration0026],
  [27, "ProviderSessionRuntimeInstanceId", Migration0027],
  [28, "ProjectionThreadSessionInstanceId", Migration0028],
  [29, "ProjectionThreadDetailOrderingIndexes", Migration0029],
  [30, "ProjectionThreadShellArchiveIndexes", Migration0030],
  [31, "AuthAuthorizationScopes", Migration0031],
  [32, "AuthPairingProofKeyThumbprint", Migration0032],
  [33, "ProjectionThreadMessageT3TeamExt", Migration0033],
  [34, "WorkflowDurability", Migration0034],
  [35, "WorkflowScheduler", Migration0035],
  [36, "AtlassianMirrorColumns", Migration0036],
  [37, "BackfillAssigneeAccountId", Migration0037],
  [38, "BacklogQuickFilters", Migration0038],
  [39, "WorkflowOrigin", Migration0039],
  [40, "ProjectionThreadMessageSequence", Migration0040],
  [41, "ProjectionThreadRetention", Migration0041],
  [42, "ProjectionThreadChildStatus", Migration0042],
  [43, "ProjectionThreadsSettled", Migration0043],
  [44, "ProjectionThreadsSnoozed", Migration0044],
  [45, "WorkflowRecipePath", Migration0045],
  [46, "WorkflowFailureReason", Migration0046],
  [47, "WorkflowHostToolGrant", Migration0047],
  [48, "ProjectSourceBindings", Migration0048],
  [49, "ProjectionThreadTitleRegeneration", Migration0049],
  [50, "ProjectionThreadsPinned", Migration0050],
  [51, "ProjectionTurnsKeysetIndex", Migration0051],
  [52, "ProjectionThreadsPinOrderKey", Migration0052],
  [53, "ProjectionProjectsDefaultThreadEnvMode", Migration0053],
  [54, "ProjectionProjectFaviconPath", Migration0054],
  [55, "AuthSessionClientConnection", Migration0055],
  [56, "ProjectionThreadLinkedPullRequest", Migration0056],
] as const;

export const migrationManifest = migrationEntries.map(([id, name]) => [id, name] as const);

export const makeMigrationLoader = (throughId?: number) =>
  Migrator.fromRecord(
    Object.fromEntries(
      migrationEntries
        .filter(([id]) => throughId === undefined || id <= throughId)
        .map(([id, name, migration]) => [`${id}_${name}`, migration]),
    ),
  );

/**
 * Migrator run function - no schema dumping needed
 * Uses the base Migrator.make without platform dependencies
 */
const run = Migrator.make({});

export interface RunMigrationsOptions {
  readonly toMigrationInclusive?: number | undefined;
}

/**
 * Run all pending migrations.
 *
 * Creates the migrations tracking table (effect_sql_migrations) if it doesn't exist,
 * then runs any migrations with ID greater than the latest recorded migration.
 *
 * Returns array of [id, name] tuples for migrations that were run.
 *
 * @returns Effect containing array of executed migrations
 */
export const runMigrations = Effect.fn("runMigrations")(function* ({
  toMigrationInclusive,
}: RunMigrationsOptions = {}) {
  const executedMigrations = yield* run({ loader: makeMigrationLoader(toMigrationInclusive) });
  const migrations = executedMigrations.map(([id, name]) => `${id}_${name}`);
  yield* migrations.length === 0
    ? Effect.logDebug("Database schema is current")
    : Effect.log("Migrations ran successfully").pipe(Effect.annotateLogs({ migrations }));
  return executedMigrations;
});

/**
 * Layer that runs migrations when the layer is built.
 *
 * Use this to ensure migrations run before your application starts.
 * Migrations are run automatically - no separate script is needed.
 *
 * @example
 * ```typescript
 * import { MigrationsLive } from "@acme/db/Migrations"
 * import * as SqliteClient from "@acme/db/SqliteClient"
 *
 * // Migrations run automatically when SqliteClient is provided
 * const AppLayer = MigrationsLive.pipe(
 *   Layer.provideMerge(SqliteClient.layer({ filename: "database.sqlite" }))
 * )
 * ```
 */
export const MigrationsLive = Layer.effectDiscard(runMigrations());
