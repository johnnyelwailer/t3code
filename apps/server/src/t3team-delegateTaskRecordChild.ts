/**
 * Records what a delegated child carries beyond V2 lineage, right after
 * delegate_task created it: its ticket and placement (`t3team_child_thread_metadata`),
 * a cross-environment binding (thread facts), and the parent's t3team tool
 * context (so the child gets the same host tools and view, re-pointed at itself).
 *
 * Every write degrades to a note: a delegation never fails after the child exists.
 */
import type {
  OrchestrationProjectShell,
  OrchestrationV2AppThread,
  ThreadEnvironmentBinding,
  ThreadId,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import type { T3TeamChildThreadMetadata } from "./t3team-childThreadMetadata.ts";
import type { T3TeamThreadToolContextStoreShape } from "./t3team-threadToolContextStore.ts";
import {
  createChildThreadToolContext,
  readTicketIdFromThreadToolContext,
} from "./t3team-toolBrokerStartChildToolContext.ts";
import type { T3TeamThreadFactsStore } from "./t3team-v2/t3team-threadFactsStore.ts";

export interface DelegatedChildRecorderDeps {
  readonly metadata: T3TeamChildThreadMetadata["Service"];
  readonly facts: T3TeamThreadFactsStore["Service"];
  readonly loadProject: (
    projectId: OrchestrationV2AppThread["projectId"],
  ) => Effect.Effect<OrchestrationProjectShell | undefined>;
  readonly toolContexts: T3TeamThreadToolContextStoreShape | undefined;
  /** The visible thread a hidden workflow helper's children are placed under. */
  readonly workflowLaunchThreadFor: ((threadId: string) => string | undefined) | undefined;
}

export interface DelegatedChildRecord {
  readonly parentThread: OrchestrationV2AppThread;
  readonly childThreadId: ThreadId;
  readonly title: string | undefined;
  readonly ticketId: string | undefined;
  readonly environment: ThreadEnvironmentBinding | undefined;
}

const noteOnFailure =
  (what: string) =>
  <E>(effect: Effect.Effect<unknown, E>): Effect.Effect<ReadonlyArray<string>> =>
    effect.pipe(
      Effect.as([] as ReadonlyArray<string>),
      Effect.catchCause((cause) =>
        Effect.logWarning(`t3team.delegate-task.${what}-failed`, { cause }).pipe(
          Effect.as([`Could not record the child's ${what}; the child runs without it.`]),
        ),
      ),
    );

export const makeDelegatedChildRecorder =
  (deps: DelegatedChildRecorderDeps) =>
  (record: DelegatedChildRecord): Effect.Effect<ReadonlyArray<string>> =>
    Effect.gen(function* () {
      const { parentThread, childThreadId } = record;
      const parentToolContext = deps.toolContexts
        ? yield* deps.toolContexts.get(parentThread.id)
        : undefined;
      const ticketId = record.ticketId ?? readTicketIdFromThreadToolContext(parentToolContext);
      const launchThreadId = deps.workflowLaunchThreadFor?.(parentThread.id);
      const placementThreadId =
        launchThreadId !== undefined && launchThreadId !== parentThread.id ? launchThreadId : null;

      const metadataNotes =
        ticketId === undefined && placementThreadId === null
          ? []
          : yield* deps.metadata
              .upsert({
                childThreadId,
                parentThreadId: parentThread.id,
                placementThreadId,
                ticketId: ticketId ?? null,
              })
              .pipe(noteOnFailure("ticket"));

      const environmentNotes =
        record.environment === undefined
          ? []
          : yield* deps.facts
              .upsert(childThreadId, { environment: record.environment })
              .pipe(noteOnFailure("environment"));

      const store = deps.toolContexts;
      const project = store ? yield* deps.loadProject(parentThread.projectId) : undefined;
      const childToolContext =
        project === undefined
          ? undefined
          : createChildThreadToolContext({
              parentToolContext,
              projectId: parentThread.projectId,
              projectTitle: project.title,
              workspaceRoot: project.workspaceRoot,
              threadId: childThreadId,
              threadTitle: record.title ?? parentThread.title,
              ...(ticketId === undefined ? {} : { ticketId }),
            });
      if (store !== undefined && childToolContext !== undefined) {
        yield* store.put({ threadId: childThreadId, toolContext: childToolContext });
      }
      return [...metadataNotes, ...environmentNotes];
    });
