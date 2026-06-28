import type { ProjectShellProject } from "@t3tools/project-context";
import type { T3workContextAvailability } from "@t3tools/project-context/t3workContextAvailability";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";

import { WorkspacePaths } from "./workspace/WorkspacePaths.ts";
import { findIndexedWorkItem } from "./t3work-context-refresh-alias.ts";
import {
  isContextRefreshStale,
  readEntryPointAvailability,
  readManifestSourceUpdatedAt,
  resolveManifestRelativePath,
} from "./t3work-context-refresh-freshness.ts";
import {
  readWorkItemSummariesByRelativePath,
  readWorkItemsIndex,
} from "./t3work-context-refresh-index.ts";
import { loadT3workContextProjectMetadata } from "./t3work-context-refresh-metadata.ts";
import { normalizeTicketKey } from "./t3work-toolBrokerContextSyncScope.ts";

export type T3workContextRefreshScope = {
  readonly project: ProjectShellProject;
  readonly requestedKey: string;
  readonly canonicalKey: string;
  readonly entryPointRelativePath: string;
  readonly manifestRelativePath: string;
  readonly indexUpdatedAt?: string;
  readonly availability: T3workContextAvailability;
  readonly stale: boolean;
};

export function loadT3workContextRefreshScope(input: {
  readonly workspaceRoot: string;
  readonly requestedKey: string;
  readonly projectId: string;
  readonly force: boolean;
}) {
  return Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const workspacePaths = yield* WorkspacePaths;
    const normalizedKey = normalizeTicketKey(input.requestedKey);

    const index = yield* readWorkItemsIndex({ workspaceRoot: input.workspaceRoot });
    const summaryByRelativePath = yield* readWorkItemSummariesByRelativePath({
      workspaceRoot: input.workspaceRoot,
      index,
    });
    const indexedItem = findIndexedWorkItem({
      index,
      normalizedKey,
      summaryByRelativePath,
    });
    if (!indexedItem?.ticketEntryPointRelativePath) {
      return yield* Effect.fail(
        `ticket_key '${input.requestedKey}' is outside current project scope.`,
      );
    }

    const project = yield* loadT3workContextProjectMetadata({
      workspaceRoot: input.workspaceRoot,
      requestedProjectId: input.projectId,
    });

    const entryPath = yield* workspacePaths.resolveRelativePathWithinRoot({
      workspaceRoot: input.workspaceRoot,
      relativePath: indexedItem.ticketEntryPointRelativePath,
    });
    const availability = readEntryPointAvailability(
      yield* fileSystem.readFileString(entryPath.absolutePath).pipe(Effect.orElseSucceed(() => "")),
    );
    const manifestRelativePath = resolveManifestRelativePath({
      ticketEntryPointRelativePath: indexedItem.ticketEntryPointRelativePath,
      ...(indexedItem.fullBundleRootRelativePath
        ? { fullBundleRootRelativePath: indexedItem.fullBundleRootRelativePath }
        : {}),
    });
    const manifestPath = yield* workspacePaths.resolveRelativePathWithinRoot({
      workspaceRoot: input.workspaceRoot,
      relativePath: manifestRelativePath,
    });
    const manifestSourceUpdatedAt = readManifestSourceUpdatedAt(
      yield* fileSystem
        .readFileString(manifestPath.absolutePath)
        .pipe(Effect.orElseSucceed(() => "")),
    );
    const indexUpdatedAt =
      typeof indexedItem.updatedAt === "string" ? indexedItem.updatedAt : undefined;
    const stale = isContextRefreshStale({
      force: input.force,
      availability,
      ...(indexUpdatedAt !== undefined ? { indexUpdatedAt } : {}),
      ...(manifestSourceUpdatedAt !== undefined ? { manifestSourceUpdatedAt } : {}),
    });

    return {
      project,
      requestedKey: input.requestedKey,
      canonicalKey: typeof indexedItem.key === "string" ? indexedItem.key : input.requestedKey,
      entryPointRelativePath: indexedItem.ticketEntryPointRelativePath,
      manifestRelativePath,
      ...(indexUpdatedAt ? { indexUpdatedAt } : {}),
      availability,
      stale,
    } satisfies T3workContextRefreshScope;
  });
}
