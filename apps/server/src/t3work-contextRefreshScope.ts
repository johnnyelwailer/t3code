import type { ProjectShellProject } from "@t3tools/project-context";
import {
  T3WORK_CONTEXT_AVAILABILITY_FULL,
  T3WORK_CONTEXT_AVAILABILITY_SUMMARY,
  type T3workContextAvailability,
} from "@t3tools/project-context/t3workContextAvailability";
import { buildContextMetadataPath } from "@t3tools/project-context/t3workContextPaths";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";

import { WorkspacePaths } from "./workspace/WorkspacePaths.ts";
import {
  WORK_ITEMS_INDEX_PATH,
  normalizeTicketKey,
  parseWorkItemsIndex,
  type WorkItemsIndex,
} from "./t3work-toolBrokerContextSyncScope.ts";

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

function parseJsonObject(contents: string): Record<string, unknown> | undefined {
  if (contents.trim().length === 0) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(contents) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

function readFullAvailability(contents: string): T3workContextAvailability {
  const parsed = parseJsonObject(contents);
  return parsed?.availability === T3WORK_CONTEXT_AVAILABILITY_FULL
    ? T3WORK_CONTEXT_AVAILABILITY_FULL
    : T3WORK_CONTEXT_AVAILABILITY_SUMMARY;
}

function readManifestSourceUpdatedAt(contents: string): string | undefined {
  const value = parseJsonObject(contents)?.sourceUpdatedAt;
  return typeof value === "string" ? value : undefined;
}

function findIndexedItem(index: WorkItemsIndex, normalizedKey: string) {
  return index.workItems?.find(
    (item) => typeof item.key === "string" && normalizeTicketKey(item.key) === normalizedKey,
  );
}

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

    const indexPath = yield* workspacePaths.resolveRelativePathWithinRoot({
      workspaceRoot: input.workspaceRoot,
      relativePath: WORK_ITEMS_INDEX_PATH,
    });
    const indexContents = yield* fileSystem
      .readFileString(indexPath.absolutePath)
      .pipe(Effect.orElseSucceed(() => ""));
    const index = parseWorkItemsIndex(indexContents);
    if (!index) {
      return yield* Effect.fail("Failed to read project work-item context index.");
    }
    const indexedItem = findIndexedItem(index, normalizedKey);
    if (!indexedItem?.ticketEntryPointRelativePath) {
      return yield* Effect.fail(
        `ticket_key '${input.requestedKey}' is outside current project scope.`,
      );
    }

    const metadataPath = yield* workspacePaths.resolveRelativePathWithinRoot({
      workspaceRoot: input.workspaceRoot,
      relativePath: buildContextMetadataPath(".t3work/context"),
    });
    const metadata = parseJsonObject(
      yield* fileSystem
        .readFileString(metadataPath.absolutePath)
        .pipe(Effect.orElseSucceed(() => "")),
    );
    const project = metadata?.project as ProjectShellProject | undefined;
    if (!project?.source?.accountId || !project.source.externalProjectId) {
      return yield* Effect.fail("Current project Atlassian source is unavailable.");
    }
    const requestedProjectId = input.projectId.trim();
    if (requestedProjectId.length > 0 && project.id !== requestedProjectId) {
      return yield* Effect.fail(
        `project_id '${requestedProjectId}' does not match workspace project '${project.id}'.`,
      );
    }

    const entryPath = yield* workspacePaths.resolveRelativePathWithinRoot({
      workspaceRoot: input.workspaceRoot,
      relativePath: indexedItem.ticketEntryPointRelativePath,
    });
    const entryContents = yield* fileSystem
      .readFileString(entryPath.absolutePath)
      .pipe(Effect.orElseSucceed(() => ""));
    const availability = readFullAvailability(entryContents);
    const manifestRelativePath = indexedItem.fullBundleRootRelativePath
      ? `${indexedItem.fullBundleRootRelativePath}/manifest.json`
      : indexedItem.ticketEntryPointRelativePath.replace(/\/entrypoint\.json$/, "/manifest.json");
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
    const stale =
      input.force ||
      availability !== T3WORK_CONTEXT_AVAILABILITY_FULL ||
      (indexUpdatedAt !== undefined && manifestSourceUpdatedAt !== indexUpdatedAt);

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
