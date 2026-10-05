/**
 * V2 thread reads the t3team tool broker serves its tools from: the thread +
 * project pair most tools need, the view stats, and the searchable transcript
 * (messages plus tool-activity turn items) the search / read-message tools scan.
 *
 * @module t3team-toolBrokerThreadReads
 */
import type {
  OrchestrationProjectShell,
  OrchestrationV2AppThread,
  OrchestrationV2TurnItem,
  ThreadId,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import type { ProjectStoreV2 } from "./orchestration-v2/ProjectStore.ts";
import type { ThreadManagementService } from "./orchestration-v2/ThreadManagementService.ts";
import type {
  ThreadMessageSearchableActivity,
  ThreadMessageSearchableMessage,
} from "./t3team-threadMessageSearch.ts";

export interface T3TeamThreadProject {
  readonly project: OrchestrationProjectShell;
  readonly thread: OrchestrationV2AppThread;
}

export interface T3TeamSearchableThread {
  readonly title: string;
  readonly messages: ReadonlyArray<ThreadMessageSearchableMessage>;
  readonly activities: ReadonlyArray<ThreadMessageSearchableActivity>;
  /** The thread this one was forked from (V2 lineage), when it is a fork. */
  readonly forkSourceThreadId: string | null;
}

/** Turn items that are the conversation itself; everything else is tool activity. */
const CONVERSATION_ITEM_TYPES = new Set<OrchestrationV2TurnItem["type"]>([
  "user_message",
  "assistant_message",
]);

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

export const makeT3TeamThreadReads = (input: {
  readonly threads: ThreadManagementService["Service"];
  readonly projects: ProjectStoreV2["Service"];
}) => {
  const { threads, projects } = input;

  const loadThreadProject = (threadId: ThreadId): Effect.Effect<T3TeamThreadProject, string> =>
    Effect.gen(function* () {
      const { thread } = yield* threads
        .getThreadRecords(threadId, [])
        .pipe(Effect.mapError(() => "Current t3team thread was not found."));
      if (thread.deletedAt !== null)
        return yield* Effect.fail("Current t3team thread was deleted.");
      const project = yield* projects.getShell(thread.projectId).pipe(Effect.mapError(message));
      if (Option.isNone(project))
        return yield* Effect.fail("Current t3team project was not found.");
      return { project: project.value, thread };
    });

  const loadThreadStats = (threadId: ThreadId) =>
    Effect.all({
      messageCount: threads.getMessageCount(threadId),
      shell: threads.getThreadShell(threadId),
    }).pipe(
      Effect.map(({ messageCount, shell }) => ({
        messageCount,
        latestRunId: shell?.latestRunId ?? null,
      })),
      Effect.mapError(message),
    );

  const loadSearchableThread = (
    threadId: ThreadId,
  ): Effect.Effect<T3TeamSearchableThread | undefined, string> =>
    threads.getThreadRecords(threadId, ["messages", "turnItems"]).pipe(
      Effect.map(({ thread, messages, turnItems }) => ({
        title: thread.title,
        messages: messages.map((entry) => ({
          id: entry.id,
          role: entry.role,
          text: entry.text,
          createdAt: DateTime.formatIso(entry.createdAt),
        })),
        activities: turnItems
          .filter((item) => !CONVERSATION_ITEM_TYPES.has(item.type))
          .map((item) => ({
            id: item.id,
            kind: item.type,
            summary: item.title,
            payload: item,
            createdAt: DateTime.formatIso(item.startedAt ?? item.updatedAt),
          })),
        forkSourceThreadId:
          thread.lineage.relationshipToParent === "fork" ? thread.lineage.parentThreadId : null,
      })),
      Effect.catch(() => Effect.succeed(undefined)),
    );

  return { loadThreadProject, loadThreadStats, loadSearchableThread };
};

export type T3TeamThreadReads = ReturnType<typeof makeT3TeamThreadReads>;
