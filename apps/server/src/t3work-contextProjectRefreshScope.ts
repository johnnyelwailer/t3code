import type { ProjectShellProject } from "@t3tools/project-context";
import {
  buildContextManifestPath,
  buildContextMetadataPath,
  buildProjectContextEntryPoint,
  T3WORK_PROJECT_CONTEXT_ROOT,
  T3WORK_WORK_ITEMS_INDEX_PATH,
} from "@t3tools/project-context/t3workContextPaths";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";

import { WorkspacePaths } from "./workspace/WorkspacePaths.ts";
import { parseWorkItemsIndex } from "./t3work-toolBrokerContextSyncScope.ts";

export type T3workContextProjectRefreshScope = {
  readonly project: ProjectShellProject;
  readonly linkedRepositoryUrls: ReadonlyArray<string>;
  readonly entryPointRelativePath: string;
  readonly manifestRelativePath: string;
  readonly workItemCount: number;
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

function readManifestSyncedAt(contents: string): string | undefined {
  const value = parseJsonObject(contents)?.syncedAt;
  return typeof value === "string" ? value : undefined;
}

function readLinkedRepositoryUrls(contents: string): ReadonlyArray<string> {
  const parsed = parseJsonObject(contents);
  const urls = parsed?.linkedRepositoryUrls;
  return Array.isArray(urls) ? urls.filter((url): url is string => typeof url === "string") : [];
}

function readLatestWorkItemUpdatedAt(indexContents: string): string | undefined {
  const index = parseWorkItemsIndex(indexContents);
  const timestamps = (index?.workItems ?? [])
    .map((item) => item.updatedAt)
    .filter((value): value is string => typeof value === "string");
  return timestamps.length > 0 ? timestamps.toSorted().at(-1) : undefined;
}

export function loadT3workContextProjectRefreshScope(input: {
  readonly workspaceRoot: string;
  readonly projectId: string;
  readonly force: boolean;
}) {
  return Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const workspacePaths = yield* WorkspacePaths;

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

    const linkedReposPath = yield* workspacePaths.resolveRelativePathWithinRoot({
      workspaceRoot: input.workspaceRoot,
      relativePath: `${T3WORK_PROJECT_CONTEXT_ROOT}/linked-repositories.json`,
    });
    const linkedRepositoryUrls = readLinkedRepositoryUrls(
      yield* fileSystem
        .readFileString(linkedReposPath.absolutePath)
        .pipe(Effect.orElseSucceed(() => "")),
    );

    const entryPointRelativePath = buildProjectContextEntryPoint(project.id);
    const manifestRelativePath = buildContextManifestPath(".t3work/context");
    const manifestPath = yield* workspacePaths.resolveRelativePathWithinRoot({
      workspaceRoot: input.workspaceRoot,
      relativePath: manifestRelativePath,
    });
    const manifestSyncedAt = readManifestSyncedAt(
      yield* fileSystem
        .readFileString(manifestPath.absolutePath)
        .pipe(Effect.orElseSucceed(() => "")),
    );

    const indexPath = yield* workspacePaths.resolveRelativePathWithinRoot({
      workspaceRoot: input.workspaceRoot,
      relativePath: T3WORK_WORK_ITEMS_INDEX_PATH,
    });
    const indexContents = yield* fileSystem
      .readFileString(indexPath.absolutePath)
      .pipe(Effect.orElseSucceed(() => ""));
    const index = parseWorkItemsIndex(indexContents);
    const latestWorkItemUpdatedAt = readLatestWorkItemUpdatedAt(indexContents);
    const workItemCount = index?.workItems?.length ?? 0;

    const stale =
      input.force ||
      manifestSyncedAt === undefined ||
      latestWorkItemUpdatedAt === undefined ||
      (manifestSyncedAt !== undefined &&
        latestWorkItemUpdatedAt !== undefined &&
        latestWorkItemUpdatedAt > manifestSyncedAt);

    return {
      project,
      linkedRepositoryUrls,
      entryPointRelativePath,
      manifestRelativePath,
      workItemCount,
      stale,
    } satisfies T3workContextProjectRefreshScope;
  });
}
