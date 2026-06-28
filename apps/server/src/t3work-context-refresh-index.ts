import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";

import { WorkspacePaths } from "./workspace/WorkspacePaths.ts";
import { parseT3workContextJsonObject } from "./t3work-context-json.ts";
import {
  WORK_ITEMS_INDEX_PATH,
  parseWorkItemsIndex,
  type WorkItemsIndex,
} from "./t3work-toolBrokerContextSyncScope.ts";

export type WorkItemSummaryByRelativePath = ReadonlyMap<
  string,
  Record<string, unknown> | undefined
>;

export function readWorkItemsIndex(input: { readonly workspaceRoot: string }) {
  return Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const workspacePaths = yield* WorkspacePaths;

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
    return index;
  });
}

export function readWorkItemSummariesByRelativePath(input: {
  readonly workspaceRoot: string;
  readonly index: WorkItemsIndex;
}) {
  return Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const workspacePaths = yield* WorkspacePaths;
    const summaryByRelativePath = new Map<string, Record<string, unknown> | undefined>();

    for (const item of input.index.workItems ?? []) {
      if (!item.relativePath) {
        continue;
      }
      const summaryPath = yield* workspacePaths.resolveRelativePathWithinRoot({
        workspaceRoot: input.workspaceRoot,
        relativePath: item.relativePath,
      });
      summaryByRelativePath.set(
        item.relativePath,
        parseT3workContextJsonObject(
          yield* fileSystem
            .readFileString(summaryPath.absolutePath)
            .pipe(Effect.orElseSucceed(() => "")),
        ),
      );
    }

    return summaryByRelativePath;
  });
}
