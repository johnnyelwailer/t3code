import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";

import {
  buildT3TeamWorkItemFocusSliceFile,
  resolveT3TeamFocusSliceAttachmentIndexPath,
} from "./t3team-context-focus-slice.ts";
import { runT3TeamContextRefreshForeground } from "./t3team-contextRefreshForegroundRun.ts";
import type { T3TeamContextRefreshSliceInput } from "./t3team-contextRefreshServiceTypes.ts";
import { loadT3TeamContextRefreshScope } from "./t3team-contextRefreshScope.ts";
import { logRefreshFinished, logRefreshStarted } from "./t3team-contextRefreshTelemetry.ts";
import { writeT3TeamWorkspaceContextFiles } from "./t3team-project-workspace-context-files.ts";
import { WorkspacePaths } from "./workspace/WorkspacePaths.ts";

export function runT3TeamContextRefreshSlice(input: T3TeamContextRefreshSliceInput) {
  return Effect.gen(function* () {
    yield* logRefreshStarted({
      ticketKey: input.ticketKey,
      projectId: input.projectId,
      workspaceRoot: input.workspaceRoot,
      force: input.force === true,
      focusKind: input.focusKind,
    });
    const scope = yield* loadT3TeamContextRefreshScope({
      workspaceRoot: input.workspaceRoot,
      requestedKey: input.ticketKey,
      projectId: input.projectId,
      force: input.force,
    });
    const workItemResult =
      scope.stale || input.force
        ? yield* runT3TeamContextRefreshForeground({
            threadId: input.threadId,
            projectId: input.projectId,
            workspaceRoot: input.workspaceRoot,
            ticketKey: input.ticketKey,
            force: input.force,
          })
        : {
            ok: true as const,
            status: "already_synced" as const,
            projectId: scope.project.id,
            ticketKey: scope.canonicalKey,
            availability: "full" as const,
            entryPointRelativePath: scope.entryPointRelativePath,
            manifestRelativePath: scope.manifestRelativePath,
            includedCount: 0,
            skippedCount: 0,
          };

    const attachmentIndexCandidate = resolveT3TeamFocusSliceAttachmentIndexPath({
      projectId: workItemResult.projectId,
      ticketKey: workItemResult.ticketKey,
      focusKind: input.focusKind,
    });
    let attachmentIndexRelativePath: string | undefined;
    if (attachmentIndexCandidate) {
      const fileSystem = yield* FileSystem.FileSystem;
      const workspacePaths = yield* WorkspacePaths;
      const resolved = yield* workspacePaths.resolveRelativePathWithinRoot({
        workspaceRoot: input.workspaceRoot,
        relativePath: attachmentIndexCandidate,
      });
      if (yield* fileSystem.exists(resolved.absolutePath)) {
        attachmentIndexRelativePath = attachmentIndexCandidate;
      }
    }

    const focusFile = buildT3TeamWorkItemFocusSliceFile({
      projectId: workItemResult.projectId,
      ticketKey: workItemResult.ticketKey,
      focusKind: input.focusKind,
      label: input.focusLabel,
      summaryItems: input.summaryItems,
      ticketEntryPointRelativePath: workItemResult.entryPointRelativePath,
      ...(attachmentIndexRelativePath ? { attachmentIndexRelativePath } : {}),
    });
    yield* writeT3TeamWorkspaceContextFiles({
      workspaceRoot: input.workspaceRoot,
      files: [{ relativePath: focusFile.relativePath, contents: focusFile.contents }],
    });

    const result = {
      ok: true,
      status: workItemResult.status,
      projectId: workItemResult.projectId,
      ticketKey: workItemResult.ticketKey,
      focusKind: input.focusKind,
      availability: "full" as const,
      focusEntryPointRelativePath: focusFile.relativePath,
      entryPointRelativePath: workItemResult.entryPointRelativePath,
      ...(attachmentIndexRelativePath ? { attachmentIndexRelativePath } : {}),
      includedCount: workItemResult.includedCount,
      skippedCount: workItemResult.skippedCount,
      ...("backgroundQueued" in workItemResult && workItemResult.backgroundQueued !== undefined
        ? { backgroundQueued: workItemResult.backgroundQueued }
        : {}),
    };
    yield* logRefreshFinished({
      ticketKey: result.ticketKey,
      projectId: result.projectId,
      status: result.status,
      includedCount: result.includedCount,
      skippedCount: result.skippedCount,
      focusKind: result.focusKind,
    });
    return result;
  });
}
