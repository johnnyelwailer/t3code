import * as Migrator from "effect/sql/Migrator";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";
import { reconcileV2PreviewMigration } from "./reconcileV2PreviewMigration.ts";
import { reconcileForkSprintLedger } from "./t3team-reconcileForkSprintLedger.ts";

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
import Migration0057 from "./Migrations/t3team-049_ProjectionThreadActivityLabel.ts";
import Migration0058 from "./Migrations/t3team-050_ProjectionThreadActivityState.ts";
import Migration0059 from "./Migrations/t3team-051_WorkflowRunIntent.ts";
import Migration0060 from "./Migrations/t3team-052_ProjectionThreadActivitiesKindIndex.ts";
// New from the 2026-09-02 upstream sync (upstream 043/044). Appended above the fork's maximum id
// rather than taking upstream's numbers, which this fork already uses — see the rule above.
import Migration0061 from "./Migrations/043_ProjectionThreadsUnsettledAt.ts";
import Migration0062 from "./Migrations/044_ClearAutomaticProjectModelDefaults.ts";
import Migration0063 from "./Migrations/t3team-053_WorkflowTurnRetries.ts";
import Migration0064 from "./Migrations/t3team-054_ProjectionThreadMessageSequenceBackfill.ts";
import Migration0065 from "./Migrations/t3team-055_ProviderUsageHold.ts";
// New from the 2026-09-06 upstream sync (upstream 045/046/047). Appended above the fork's maximum id
// rather than taking upstream's numbers, which this fork already uses — see the rule above.
import Migration0066 from "./Migrations/045_ProjectionProjectsAutoPull.ts";
import Migration0067 from "./Migrations/046_RepairAutomaticSettlementTimestamps.ts";
import Migration0068 from "./Migrations/047_ProjectionProjectIcon.ts";
import Migration0069 from "./Migrations/t3team-056_ThreadTaskRecords.ts";
import Migration0070 from "./Migrations/t3team-057_DropThreadTaskRecords.ts";
import Migration0071 from "./Migrations/t3team-058_ProjectionThreadEnvironment.ts";
// New from the 2026-09-17 upstream sync (upstream 048-052). Appended above the fork's maximum id
// rather than taking upstream's numbers, which this fork already uses — see the rule above.
import Migration0072 from "./Migrations/048_ProjectionThreadBranchPullRequest.ts";
import Migration0073 from "./Migrations/049_ProjectionThreadsActiveOrderKey.ts";
import Migration0074 from "./Migrations/050_ProjectionThreadPullRequests.ts";
import Migration0075 from "./Migrations/051_ProjectionThreadMessageContext.ts";
import Migration0076 from "./Migrations/052_ProjectionThreadTitleState.ts";
import Migration0077 from "./Migrations/t3team-059_SignalSources.ts";
// Tail repair for the GHE #382 kind-index ledger collision: re-runs the
// `idx_projection_thread_activities_kind_created` DDL for machines whose ledger
// consumed id 60 with a different migration and therefore never ran it.
import Migration0078 from "./Migrations/t3team-060_EnsureProjectionThreadActivitiesKindIndex.ts";
import Migration0079 from "./Migrations/t3team-061_ResourcePressureEvents.ts";
// New from the 2026-09-27 upstream sync (upstream 053/054). Appended above the fork's maximum id
// rather than taking upstream's numbers, which this fork already uses — see the rule above.
import Migration0080 from "./Migrations/053_PullRequestFilesViewed.ts";
import Migration0081 from "./Migrations/054_ProjectionThreadsAutoSettleDisabledAt.ts";
import Migration0082 from "./Migrations/t3team-062_ProjectionThreadShellT3TeamFacts.ts";
import Migration0083 from "./Migrations/t3team-063_OrchestrationEventsTypeSequenceIndex.ts";
// New from the 2026-10-03 upstream sync (upstream 055/056: orchestration V2). Appended above the
// fork's maximum id (83), as for every earlier sync: fork databases already recorded 55/56 as
// AuthSessionClientConnection/ProjectionThreadLinkedPullRequest, so registering V2 at 55 would be
// skipped on every existing fork install and boot would fail on the first orchestration_v2_* query.
import Migration0084 from "./Migrations/055_OrchestrationV2.ts";
import Migration0085 from "./Migrations/056_RemoveRedundantProjectionIndexes.ts";
// Fork side stores for V2 (thread facts, thread artifacts); fork file numbers run 22 below ids.
import Migration0086 from "./Migrations/t3team-064_ThreadFacts.ts";
import Migration0087 from "./Migrations/t3team-065_ThreadArtifacts.ts";
import Migration0090 from "./Migrations/t3team-068_ChildThreadMetadata.ts";
import Migration0091 from "./Migrations/t3team-069_LineageCutover.ts";
import Migration0092 from "./Migrations/t3team-070_ThreadMailbox.ts";
import Migration0097 from "./Migrations/t3team-075_DropProviderUsageHolds.ts";
import Migration0098 from "./Migrations/t3team-076_ThreadSilenceWatches.ts";
import Migration0099 from "./Migrations/t3team-077_RepairForkPortTables.ts";
// Project main repository + feature flags: main's sprint migrations. Main originally registered
// these at 84/85, which this fork's V2 sync already uses, so they move above the current maximum
// id (101 at the time) to keep the ledger monotonic on every existing fork install.
// Databases that already recorded them at 84/85 are relabelled before the Migrator runs; see
// t3team-reconcileForkSprintLedger.ts.
import Migration0100 from "./Migrations/t3team-064_ProjectionProjectsMainRepository.ts";
import Migration0101 from "./Migrations/t3team-065_FeatureFlags.ts";
// Skills-as-subagents Phase 1 (WI-1): delegate_task `extensions.skills` persists the
// REQUESTED skill names on the child's metadata row. The host never resolves them — the
// child's driver loads them from its pack registry at session start (no second catalog).
import Migration0102 from "./Migrations/t3team-078_SkillDelegationMetadata.ts";
// New from the 2026-10-06 upstream sync (upstream 057/058). Appended above the fork's maximum id
// rather than taking upstream's numbers, which this fork already uses — see the rule above.
import Migration0103 from "./Migrations/057_ScheduledTaskWebhooks.ts";
import Migration0104 from "./Migrations/058_WebhookRelayDeliveries.ts";
import Migration0105 from "./Migrations/t3team-079_PackDocuments.ts";
// Any-wait signal parks: the branch list a `waitForAny` run is parked on.
import Migration0106 from "./Migrations/t3team-080_WorkflowRunWatchAny.ts";
// New from the 2026-10-08 upstream sync (upstream 059/060). Appended above the fork's maximum id
// rather than taking upstream's numbers, which this fork already uses — see the rule above. Fork
// main shipped 105 (PackDocuments) and 106 (WorkflowRunWatchAny) first, so these take 107/108.
import Migration0107 from "./Migrations/059_McpAppModelContext.ts";
import Migration0108 from "./Migrations/060_ThreadSnapshotWindowIndexes.ts";
// New from the 2026-10-11 upstream sync (upstream 061). Appended above the fork's maximum id (108).
import Migration0109 from "./Migrations/061_PullRequestReviewGuides.ts";
// New from the 2026-10-14 upstream sync (upstream 062). Appended above the fork's maximum id (109).
import Migration0110 from "./Migrations/062_ThreadFailureLookupIndex.ts";
// Trigger-maintained per-thread item counts and a user-authored message index for shell reads.
import Migration0111 from "./Migrations/t3team-081_ShellItemCounts.ts";
// New from the 2026-10-19 upstream sync (upstream 064). Appended above the fork's maximum id (111).
// Upstream 063 (DropUnusedV1Projections) is held: it drops projection_thread_activities, which the
// fork's one-time V1 lineage cutover still reads. Register it above the maximum once the cutover
// is confirmed done everywhere.
import Migration0112 from "./Migrations/064_CanonicalizeThreadPullRequestLinks.ts";
// New from the 2026-10-21 upstream sync (upstream 065/066/067). Appended above the fork's maximum id
// (112), as for every earlier sync; upstream 063 stays held (see above).
import Migration0113 from "./Migrations/065_CodexUsageNativeTurnIndex.ts";
import Migration0114 from "./Migrations/066_RepairClientSettlementTimestamps.ts";
import Migration0115 from "./Migrations/067_WebhookDedupe.ts";
// Recipe-trigger launch ledger: the claim and the pending launch commit together.
import Migration0116 from "./Migrations/t3team-082_SignalTriggerLaunches.ts";
import Migration0117 from "./Migrations/t3team-083_CloudChildPlacements.ts";
// New from the 2026-10-29 upstream sync (upstream 068-073). Appended above the fork's maximum id
// (117; the new ones run 118-123), as for every earlier sync; upstream 063 stays held (see above).
import Migration0118 from "./Migrations/068_ShellStopRequestIndex.ts";
import Migration0119 from "./Migrations/069_ThreadMessageSearch.ts";
import Migration0120 from "./Migrations/070_PeerLinks.ts";
import Migration0121 from "./Migrations/071_PeerLinkFence.ts";
import Migration0122 from "./Migrations/072_WaitingLinkRequestIndex.ts";
import Migration0123 from "./Migrations/073_ActiveTurnItemIndexes.ts";
// New from the 2026-10-31 upstream sync (upstream 074-075), appended above the fork's maximum (123).
import Migration0124 from "./Migrations/074_ExcludeAttachmentPlaceholdersFromSearch.ts";
import Migration0125 from "./Migrations/075_SubagentDeliveryState.ts";

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
  [57, "ProjectionThreadActivityLabel", Migration0057],
  [58, "ProjectionThreadActivityState", Migration0058],
  [59, "WorkflowRunIntent", Migration0059],
  [60, "ProjectionThreadActivitiesKindIndex", Migration0060],
  [61, "ProjectionThreadsUnsettledAt", Migration0061],
  [62, "ClearAutomaticProjectModelDefaults", Migration0062],
  [63, "WorkflowTurnRetries", Migration0063],
  [64, "ProjectionThreadMessageSequenceBackfill", Migration0064],
  [65, "ProviderUsageHold", Migration0065],
  [66, "ProjectionProjectsAutoPull", Migration0066],
  [67, "RepairAutomaticSettlementTimestamps", Migration0067],
  [68, "ProjectionProjectIcon", Migration0068],
  [69, "ThreadTaskRecords", Migration0069],
  [70, "DropThreadTaskRecords", Migration0070],
  [71, "ProjectionThreadEnvironment", Migration0071],
  [72, "ProjectionThreadBranchPullRequest", Migration0072],
  [73, "ProjectionThreadsActiveOrderKey", Migration0073],
  [74, "ProjectionThreadPullRequests", Migration0074],
  [75, "ProjectionThreadMessageContext", Migration0075],
  [76, "ProjectionThreadTitleState", Migration0076],
  [77, "SignalSources", Migration0077],
  [78, "EnsureProjectionThreadActivitiesKindIndex", Migration0078],
  [79, "ResourcePressureEvents", Migration0079],
  [80, "PullRequestFilesViewed", Migration0080],
  [81, "ProjectionThreadsAutoSettleDisabledAt", Migration0081],
  [82, "ProjectionThreadShellT3TeamFacts", Migration0082],
  [83, "OrchestrationEventsTypeSequenceIndex", Migration0083],
  // Upstream 055/056 (orchestration V2) live at 84/85 in this fork's ledger; see the import comment.
  // Preserve this migration's schema. Future V2 schema changes need new migrations. A new
  // migration must take an id ABOVE the highest id registered here (currently 125) — never one of
  // the gaps (88-89, 93-96): upgraded databases have recorded the maximum, and the Migrator skips
  // every id at or below it. Upstream's reconcileV2PreviewMigration stays a no-op on fork ledgers
  // (fork ids 53/54 are never named OrchestrationV2).
  [84, "OrchestrationV2", Migration0084],
  [85, "RemoveRedundantProjectionIndexes", Migration0085],
  [86, "ThreadFacts", Migration0086],
  [87, "ThreadArtifacts", Migration0087],
  [90, "ChildThreadMetadata", Migration0090],
  [91, "LineageCutover", Migration0091],
  [92, "ThreadMailbox", Migration0092],
  [97, "DropProviderUsageHolds", Migration0097],
  [98, "ThreadSilenceWatches", Migration0098],
  [99, "RepairForkPortTables", Migration0099],
  [100, "ProjectionProjectsMainRepository", Migration0100],
  [101, "FeatureFlags", Migration0101],
  [102, "SkillDelegationMetadata", Migration0102],
  // Upstream 057/058 live at 103/104 in this fork's ledger; see the import comment.
  [103, "ScheduledTaskWebhooks", Migration0103],
  [104, "WebhookRelayDeliveries", Migration0104],
  [105, "PackDocuments", Migration0105],
  [106, "WorkflowRunWatchAny", Migration0106],
  // Upstream 059/060 live at 107/108 in this fork's ledger; see the import comment.
  [107, "McpAppModelContext", Migration0107],
  [108, "ThreadSnapshotWindowIndexes", Migration0108],
  // Upstream 061 lives at 109 in this fork's ledger; see the import comment.
  [109, "PullRequestReviewGuides", Migration0109],
  // Upstream 062 lives at 110 in this fork's ledger; see the import comment.
  [110, "ThreadFailureLookupIndex", Migration0110],
  [111, "ShellItemCounts", Migration0111],
  // Upstream 064 lives at 112 in this fork's ledger; upstream 063 is held. See the import comment.
  [112, "CanonicalizeThreadPullRequestLinks", Migration0112],
  // Upstream 065-067 live at 113-115 in this fork's ledger; see the import comment.
  [113, "CodexUsageNativeTurnIndex", Migration0113],
  [114, "RepairClientSettlementTimestamps", Migration0114],
  [115, "WebhookDedupe", Migration0115],
  [116, "SignalTriggerLaunches", Migration0116],
  [117, "CloudChildPlacements", Migration0117],
  // Upstream 068-073 live at 118-123 in this fork's ledger; see the import comment.
  [118, "ShellStopRequestIndex", Migration0118],
  [119, "ThreadMessageSearch", Migration0119],
  [120, "PeerLinks", Migration0120],
  [121, "PeerLinkFence", Migration0121],
  [122, "WaitingLinkRequestIndex", Migration0122],
  [123, "ActiveTurnItemIndexes", Migration0123],
  // Upstream 074-075 live at 124-125 in this fork's ledger; see the import comment.
  [124, "ExcludeAttachmentPlaceholdersFromSearch", Migration0124],
  [125, "SubagentDeliveryState", Migration0125],
] as const;

export const migrationManifest = migrationEntries.map(([id, name]) => [id, name] as const);

const makeMigrationLoader = (throughId?: number) =>
  Migrator.fromRecord(
    Object.fromEntries(
      migrationEntries
        .filter(([id]) => throughId === undefined || id <= throughId)
        .map(([id, name, migration]) => [`${id}_${name}`, migration]),
    ),
  );

// V2's schema migrations start at upstream id 55, which this fork's ledger registers at 84
// (OrchestrationV2). Upstream's guard below hard-coded 55, but on fork databases 55-83 hold
// fork and earlier-sync migrations, including the known GHE #382 collision where id 60 was
// recorded as ProjectionThreadsUnsettledAt (repaired by 78). Checking from 55 refused every
// pre-sync fork install. Fork convention: upstream migrations keep upstream filenames but are
// registered ABOVE the fork's current maximum id, so this constant is the fork id of upstream 055.
export const FIRST_V2_MIGRATION_ID = 84;

// The ledger ids that carry upstream-owned V2 migrations in this fork's ledger (upstream 055/056
// at 84/85, 057/058 at 103/104, 059/060 at 107/108, 061 at 109, 062 at 110, 064-067 at
// 112-115, 068-073 at 118-123; 063 is held). Only these are checked for being
// skipped: fork migrations (and the repair migrations for fork DBs that have gaps, e.g. 99, which
// re-ensures 86-92 and 98) must keep starting on databases whose history has holes. Add each id a
// sync appends from upstream.
export const UPSTREAM_V2_MIGRATION_IDS: ReadonlySet<number> = new Set([
  84, 85, 103, 104, 107, 108, 109, 110, 112, 113, 114, 115, 118, 119, 120, 121, 122, 123, 124, 125,
]);

// Migrators skip ids up to the highest recorded; reject collisions that would skip V2 schema.
const assertV2MigrationsCanRun = Effect.fn("assertV2MigrationsCanRun")(function* (
  throughId?: number,
) {
  const sql = yield* SqlClient.SqlClient;
  const tables = yield* sql`
    SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'effect_sql_migrations'
  `;
  if (tables.length === 0) return;
  const recorded = yield* sql<{
    readonly migration_id: number;
    readonly name: string;
  }>`SELECT migration_id, name FROM effect_sql_migrations`;
  const latestRecordedId = Math.max(0, ...recorded.map((row) => row.migration_id));
  const recordedNames = new Map(recorded.map((row) => [row.migration_id, row.name]));
  const skipped = migrationEntries.flatMap(([id, name]) => {
    if (
      !UPSTREAM_V2_MIGRATION_IDS.has(id) ||
      id > latestRecordedId ||
      (throughId !== undefined && id > throughId)
    )
      return [];
    const recordedName = recordedNames.get(id);
    if (recordedName === name) return [];
    return [`${id}_${name} (recorded: ${recordedName ?? "nothing"})`];
  });
  if (skipped.length === 0) return;
  return yield* new Migrator.MigrationError({
    kind: "BadState",
    message: `This database's migration history would skip required schema migrations: ${skipped.join(", ")}. The migrator skips every id up to the highest recorded id (${latestRecordedId}), regardless of name. It was probably written by a different build. Start the build that wrote it, or report this migration history so an upgrade path can be added.`,
  });
});

const run = Migrator.make({});

export interface RunMigrationsOptions {
  readonly toMigrationInclusive?: number | undefined;
}

export const runMigrations = Effect.fn("runMigrations")(function* ({
  toMigrationInclusive,
}: RunMigrationsOptions = {}) {
  const includesV2 =
    toMigrationInclusive === undefined || toMigrationInclusive >= FIRST_V2_MIGRATION_ID;
  const previewMigrations = includesV2 ? yield* reconcileV2PreviewMigration() : [];
  // Relabel the fork sprint ledger (84/85) first: those databases are repairable, so the guard
  // must judge the reconciled ledger, not refuse it.
  const sprintLedgerMigrations =
    toMigrationInclusive === undefined || toMigrationInclusive >= 84
      ? yield* reconcileForkSprintLedger()
      : [];
  if (includesV2) {
    yield* assertV2MigrationsCanRun(toMigrationInclusive);
  }
  const executedMigrations = [
    ...previewMigrations,
    ...sprintLedgerMigrations,
    ...(yield* run({ loader: makeMigrationLoader(toMigrationInclusive) })),
  ];
  const migrations = executedMigrations.map(([id, name]) => `${id}_${name}`);
  yield* migrations.length === 0
    ? Effect.logDebug("Database schema is current")
    : Effect.log("Migrations ran successfully").pipe(Effect.annotateLogs({ migrations }));

  const sql = yield* SqlClient.SqlClient;
  const recorded = yield* sql<{
    readonly migration_id: number;
    readonly name: string;
  }>`SELECT migration_id, name FROM effect_sql_migrations`;
  const manifestNames = new Map<number, string>(migrationEntries.map(([id, name]) => [id, name]));
  const divergent = recorded.flatMap((row) => {
    const expected = manifestNames.get(row.migration_id);
    if (expected === undefined) {
      return [`${row.migration_id}:${row.name} (unknown to this build)`];
    }
    return expected === row.name
      ? []
      : [`${row.migration_id}:${row.name} (this build: ${expected})`];
  });
  if (divergent.length > 0) {
    yield* Effect.logWarning(
      "Database migration history diverges from this build; recorded migration ids are skipped, not reconciled by name.",
    ).pipe(Effect.annotateLogs({ divergent }));
  }
  return executedMigrations;
});
