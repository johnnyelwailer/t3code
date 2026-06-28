import type { ThreadId } from "@t3tools/contracts";
import {
  T3WORK_CONTEXT_AVAILABILITY_FULL,
  T3WORK_CONTEXT_AVAILABILITY_SUMMARY,
} from "@t3tools/project-context/t3workContextAvailability";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";

import { WorkspacePaths } from "./workspace/WorkspacePaths.ts";
import { T3workContextSyncQueue } from "./t3work-contextSyncQueue.ts";
import { errorResult, okResult } from "./t3work-toolBrokerHelpers.ts";
import type { T3workTurnToolContext } from "./t3work-toolBroker.ts";
import {
  WORK_ITEMS_INDEX_PATH,
  normalizeTicketKey,
  parseWorkItemsIndex,
  readTicketKeyArg,
  readToolContextView,
} from "./t3work-toolBrokerContextSyncScope.ts";

const MAX_SYNC_WAIT_ATTEMPTS = 45;

export function callT3workWorkItemRefreshContextBundleEffect(input: {
  readonly threadId: ThreadId;
  readonly toolArgs: unknown;
  readonly toolContext: T3workTurnToolContext;
}) {
  return Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const workspacePaths = yield* WorkspacePaths;
    const queue = yield* T3workContextSyncQueue;
    const view = readToolContextView(input.toolContext);
    const projectId = view.projectId?.trim() ?? "";
    const workspaceRoot = view.workspaceRoot?.trim() ?? "";
    if (projectId.length === 0 || workspaceRoot.length === 0) {
      return errorResult("Current project workspace is unavailable for context sync.");
    }

    const requestedKey = readTicketKeyArg(input.toolArgs) ?? view.ticketId?.trim() ?? "";
    if (requestedKey.length === 0) {
      return errorResult("ticket_key is required when no current work item is bound.");
    }
    const normalizedRequestedKey = normalizeTicketKey(requestedKey);

    const indexResolved = yield* workspacePaths.resolveRelativePathWithinRoot({
      workspaceRoot,
      relativePath: WORK_ITEMS_INDEX_PATH,
    });
    const indexContents = yield* fileSystem
      .readFileString(indexResolved.absolutePath)
      .pipe(Effect.catch(() => Effect.succeed("")));
    const index = parseWorkItemsIndex(indexContents);
    if (index === undefined) {
      return errorResult("Failed to read project work-item context index.");
    }

    const indexedItem = index.workItems?.find(
      (item) =>
        typeof item.key === "string" && normalizeTicketKey(item.key) === normalizedRequestedKey,
    );
    if (!indexedItem?.ticketEntryPointRelativePath) {
      return errorResult(
        `ticket_key '${requestedKey}' is outside the current project workspace scope.`,
      );
    }

    const entryResolved = yield* workspacePaths.resolveRelativePathWithinRoot({
      workspaceRoot,
      relativePath: indexedItem.ticketEntryPointRelativePath,
    });
    const readAvailability = Effect.gen(function* () {
      const entryContents = yield* fileSystem
        .readFileString(entryResolved.absolutePath)
        .pipe(Effect.catch(() => Effect.succeed("")));
      if (entryContents.trim().length === 0) {
        return {
          availability: T3WORK_CONTEXT_AVAILABILITY_SUMMARY,
          entryPointRelativePath: indexedItem.ticketEntryPointRelativePath,
        };
      }
      try {
        const parsed = JSON.parse(entryContents) as { availability?: string };
        return {
          availability:
            parsed.availability === T3WORK_CONTEXT_AVAILABILITY_FULL
              ? T3WORK_CONTEXT_AVAILABILITY_FULL
              : T3WORK_CONTEXT_AVAILABILITY_SUMMARY,
          entryPointRelativePath: indexedItem.ticketEntryPointRelativePath,
        };
      } catch {
        return {
          availability: T3WORK_CONTEXT_AVAILABILITY_SUMMARY,
          entryPointRelativePath: indexedItem.ticketEntryPointRelativePath,
        };
      }
    });

    const before = yield* readAvailability;
    if (before.availability === T3WORK_CONTEXT_AVAILABILITY_FULL) {
      return okResult({
        ok: true,
        status: "already_synced",
        projectId,
        ticketKey: requestedKey,
        availability: before.availability,
        entryPointRelativePath: before.entryPointRelativePath,
      });
    }

    const request = yield* queue.enqueue({
      threadId: input.threadId,
      projectId,
      workspaceRoot,
      ticketKey: requestedKey,
    });

    for (let attempt = 0; attempt < MAX_SYNC_WAIT_ATTEMPTS; attempt += 1) {
      const current = yield* readAvailability;
      if (current.availability === T3WORK_CONTEXT_AVAILABILITY_FULL) {
        yield* queue.complete({ threadId: input.threadId, requestId: request.id });
        return okResult({
          ok: true,
          status: "synced",
          projectId,
          ticketKey: requestedKey,
          availability: current.availability,
          entryPointRelativePath: current.entryPointRelativePath,
          requestId: request.id,
        });
      }
      yield* Effect.sleep("1 second");
    }

    return okResult({
      ok: false,
      status: "sync_pending",
      projectId,
      ticketKey: requestedKey,
      availability: T3WORK_CONTEXT_AVAILABILITY_SUMMARY,
      entryPointRelativePath: before.entryPointRelativePath,
      requestId: request.id,
      message:
        "Full work-item context sync is still running in the connected t3work client. Retry the tool or read the summary file until availability is full.",
    });
  }).pipe(
    Effect.catch((cause) =>
      Effect.succeed(
        errorResult(
          `Failed to refresh work-item context bundle: ${
            cause instanceof Error ? cause.message : String(cause)
          }`,
        ),
      ),
    ),
  );
}
