import type { ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import type { T3TeamContextRefreshServiceShape } from "./t3team-contextRefreshService.ts";
import { errorResult, okResult } from "./t3team-toolBrokerHelpers.ts";
import type { T3TeamTurnToolContext } from "./t3team-toolBroker.ts";
import {
  readBoundTicketKey,
  readForceRefreshArg,
  readTicketKeyArg,
  readToolContextView,
} from "./t3team-toolBrokerContextSyncScope.ts";

export function callT3TeamProjectRefreshContextBundleEffect(input: {
  readonly threadId: ThreadId;
  readonly toolArgs: unknown;
  readonly toolContext: T3TeamTurnToolContext;
  readonly refreshService: T3TeamContextRefreshServiceShape;
}) {
  return Effect.gen(function* () {
    const view = readToolContextView(input.toolContext);
    const projectId = view.projectId?.trim() ?? "";
    const workspaceRoot = view.workspaceRoot?.trim() ?? "";
    if (projectId.length === 0 || workspaceRoot.length === 0) {
      return errorResult("Current project workspace is unavailable for context sync.");
    }

    const result = yield* input.refreshService.refreshProject({
      threadId: input.threadId,
      projectId,
      workspaceRoot,
      force: readForceRefreshArg(input.toolArgs),
    });
    return okResult(result);
  }).pipe(
    Effect.catch((cause) =>
      Effect.succeed(
        errorResult(
          `Failed to refresh project context bundle: ${
            cause instanceof Error ? cause.message : String(cause)
          }`,
        ),
      ),
    ),
  );
}

export function callT3TeamWorkItemRefreshContextBundleEffect(input: {
  readonly threadId: ThreadId;
  readonly toolArgs: unknown;
  readonly toolContext: T3TeamTurnToolContext;
  readonly refreshService: T3TeamContextRefreshServiceShape;
}) {
  return Effect.gen(function* () {
    const view = readToolContextView(input.toolContext);
    const projectId = view.projectId?.trim() ?? "";
    const workspaceRoot = view.workspaceRoot?.trim() ?? "";
    if (projectId.length === 0 || workspaceRoot.length === 0) {
      return errorResult("Current project workspace is unavailable for context sync.");
    }

    const requestedKey = readTicketKeyArg(input.toolArgs) ?? readBoundTicketKey(view);
    if (requestedKey.length === 0) {
      return errorResult("ticket_key is required when no current work item is bound.");
    }
    const result = yield* input.refreshService.refreshWorkItem({
      threadId: input.threadId,
      projectId,
      workspaceRoot,
      ticketKey: requestedKey,
      force: readForceRefreshArg(input.toolArgs),
    });
    return okResult(result);
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
