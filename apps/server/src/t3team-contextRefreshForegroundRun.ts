import * as Effect from "effect/Effect";

import { providerForAccount } from "./t3team-atlassian-auth-store.ts";
import {
  ensureT3TeamContextCacheTables,
  upsertT3TeamContextEdges,
} from "./t3team-context-cache-tables.ts";
import { buildT3TeamContextAttachmentAssets } from "./t3team-context-attachment-assets.ts";
import { buildT3TeamWorkItemContextBundle } from "./t3team-context-bundle-builder.ts";
import { kickT3TeamContextBackgroundExpansion } from "./t3team-contextRefreshBackground.ts";
import { buildT3TeamForegroundContextGraph } from "./t3team-contextRefreshGraph.ts";
import {
  assertT3TeamContextRefreshNotSuperseded,
  type T3TeamContextRefreshSupersession,
} from "./t3team-contextRefreshServiceDedup.ts";
import type { T3TeamContextRefreshInput } from "./t3team-contextRefreshServiceTypes.ts";
import { loadT3TeamContextRefreshScope } from "./t3team-contextRefreshScope.ts";
import { logRefreshFinished, logRefreshStarted } from "./t3team-contextRefreshTelemetry.ts";
import { writeT3TeamWorkspaceContextFiles } from "./t3team-project-workspace-context-files.ts";

export function runT3TeamContextRefreshForeground(
  input: T3TeamContextRefreshInput,
  supersession?: T3TeamContextRefreshSupersession,
) {
  return Effect.gen(function* () {
    yield* logRefreshStarted({
      ticketKey: input.ticketKey,
      projectId: input.projectId,
      workspaceRoot: input.workspaceRoot,
      force: input.force === true,
    });
    yield* assertT3TeamContextRefreshNotSuperseded(supersession);
    const scope = yield* loadT3TeamContextRefreshScope({
      workspaceRoot: input.workspaceRoot,
      requestedKey: input.ticketKey,
      projectId: input.projectId,
      force: input.force,
    });
    if (!scope.stale) {
      const result = {
        ok: true,
        status: "already_synced" as const,
        projectId: scope.project.id,
        ticketKey: scope.canonicalKey,
        availability: "full" as const,
        entryPointRelativePath: scope.entryPointRelativePath,
        manifestRelativePath: scope.manifestRelativePath,
        includedCount: 0,
        skippedCount: 0,
      };
      yield* logRefreshFinished({
        ticketKey: result.ticketKey,
        projectId: result.projectId,
        status: result.status,
        includedCount: result.includedCount,
        skippedCount: result.skippedCount,
      });
      return result;
    }

    yield* assertT3TeamContextRefreshNotSuperseded(supersession);
    yield* ensureT3TeamContextCacheTables();
    const provider = yield* providerForAccount(scope.project.source.accountId!);
    const graph = yield* buildT3TeamForegroundContextGraph({
      project: scope.project,
      provider,
      rootKey: scope.canonicalKey,
    });
    yield* assertT3TeamContextRefreshNotSuperseded(supersession);
    yield* upsertT3TeamContextEdges({
      identity: {
        provider: scope.project.source.provider,
        accountId: scope.project.source.accountId!,
        externalProjectId: scope.project.source.externalProjectId!,
      },
      rootKey: graph.nodes[0]?.key ?? scope.canonicalKey,
      edges: graph.edges,
    });
    const attachments =
      "downloadAsset" in provider
        ? yield* buildT3TeamContextAttachmentAssets({
            provider,
            projectId: scope.project.id,
            snapshotsByKey: graph.snapshotsByKey,
          })
        : { files: [], byTicketKey: new Map() };
    const bundle = buildT3TeamWorkItemContextBundle({
      projectId: scope.project.id,
      rootKey: graph.nodes[0]?.key ?? scope.canonicalKey,
      nodes: graph.nodes,
      attachmentFiles: attachments.files,
      attachmentIndexes: attachments.byTicketKey,
    });
    yield* assertT3TeamContextRefreshNotSuperseded(supersession);
    yield* writeT3TeamWorkspaceContextFiles({
      workspaceRoot: input.workspaceRoot,
      files: bundle.files,
    });
    const background = yield* kickT3TeamContextBackgroundExpansion({
      project: scope.project,
      provider,
      workspaceRoot: input.workspaceRoot,
      rootKey: graph.nodes[0]?.key ?? scope.canonicalKey,
      seeds: graph.backgroundSeeds,
    });

    const result = {
      ok: true,
      status: "synced" as const,
      projectId: scope.project.id,
      ticketKey: graph.nodes[0]?.key ?? scope.canonicalKey,
      availability: "full" as const,
      entryPointRelativePath: bundle.rootEntryPointRelativePath,
      manifestRelativePath: bundle.rootManifestRelativePath,
      includedCount: bundle.includedCount,
      skippedCount: bundle.skippedCount,
      backgroundJobId: background.jobId,
      backgroundTargetDepth: background.targetDepth,
      backgroundQueued: background.queued,
    };
    yield* logRefreshFinished({
      ticketKey: result.ticketKey,
      projectId: result.projectId,
      status: result.status,
      includedCount: result.includedCount,
      skippedCount: result.skippedCount,
      backgroundJobId: result.backgroundJobId,
      backgroundQueued: result.backgroundQueued,
    });
    return result;
  });
}
