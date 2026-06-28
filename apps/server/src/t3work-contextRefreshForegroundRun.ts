import * as Effect from "effect/Effect";

import { providerForAccount } from "./t3work-atlassian-auth-store.ts";
import {
  ensureT3workContextCacheTables,
  upsertT3workContextEdges,
} from "./t3work-context-cache-tables.ts";
import { buildT3workContextAttachmentAssets } from "./t3work-context-attachment-assets.ts";
import { buildT3workWorkItemContextBundle } from "./t3work-context-bundle-builder.ts";
import { kickT3workContextBackgroundExpansion } from "./t3work-contextRefreshBackground.ts";
import { buildT3workForegroundContextGraph } from "./t3work-contextRefreshGraph.ts";
import {
  assertT3workContextRefreshNotSuperseded,
  type T3workContextRefreshSupersession,
} from "./t3work-contextRefreshServiceDedup.ts";
import type { T3workContextRefreshInput } from "./t3work-contextRefreshServiceTypes.ts";
import { loadT3workContextRefreshScope } from "./t3work-contextRefreshScope.ts";
import { logRefreshFinished, logRefreshStarted } from "./t3work-contextRefreshTelemetry.ts";
import { writeT3workWorkspaceContextFiles } from "./t3work-project-workspace-context-files.ts";

export function runT3workContextRefreshForeground(
  input: T3workContextRefreshInput,
  supersession?: T3workContextRefreshSupersession,
) {
  return Effect.gen(function* () {
    yield* logRefreshStarted({
      ticketKey: input.ticketKey,
      projectId: input.projectId,
      workspaceRoot: input.workspaceRoot,
      force: input.force === true,
    });
    yield* assertT3workContextRefreshNotSuperseded(supersession);
    const scope = yield* loadT3workContextRefreshScope({
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

    yield* assertT3workContextRefreshNotSuperseded(supersession);
    yield* ensureT3workContextCacheTables();
    const provider = yield* providerForAccount(scope.project.source.accountId!);
    const graph = yield* buildT3workForegroundContextGraph({
      project: scope.project,
      provider,
      rootKey: scope.canonicalKey,
    });
    yield* assertT3workContextRefreshNotSuperseded(supersession);
    yield* upsertT3workContextEdges({
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
        ? yield* buildT3workContextAttachmentAssets({
            provider,
            projectId: scope.project.id,
            snapshotsByKey: graph.snapshotsByKey,
          })
        : { files: [], byTicketKey: new Map() };
    const bundle = buildT3workWorkItemContextBundle({
      projectId: scope.project.id,
      rootKey: graph.nodes[0]?.key ?? scope.canonicalKey,
      nodes: graph.nodes,
      attachmentFiles: attachments.files,
      attachmentIndexes: attachments.byTicketKey,
    });
    yield* assertT3workContextRefreshNotSuperseded(supersession);
    yield* writeT3workWorkspaceContextFiles({
      workspaceRoot: input.workspaceRoot,
      files: bundle.files,
    });
    const background = yield* kickT3workContextBackgroundExpansion({
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
