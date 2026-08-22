import { CommandId, EventId, MessageId, ThreadId } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { HttpRouter } from "effect/unstable/http";

import { OrchestrationEngineService } from "./orchestration/Services/OrchestrationEngine.ts";
import { ProjectionSnapshotQuery } from "./orchestration/Services/ProjectionSnapshotQuery.ts";
import {
  errorResponse,
  okJson,
  readJsonBody,
  T3TeamAtlassianError,
  toAtlassianError,
} from "./t3team-atlassian-http.ts";
import { estimateMessageTokens, planForkTranscript } from "./t3team-thread-fork-plan.ts";
import { t3teamRandomUUID } from "./t3team-random.ts";
import { T3TeamThreadToolContextStore } from "./t3team-threadToolContextStore.ts";

type T3TeamThreadForkRequest = {
  readonly threadId?: string;
  readonly title?: string;
  /** Fork branch point: copy messages up to and including this message id. */
  readonly upToMessageId?: string;
};

type T3TeamThreadForkResponse = {
  readonly ok: true;
  readonly childThreadId: string;
};

export const t3teamThreadForkRouteLayer = HttpRouter.add(
  "POST",
  "/api/t3team/thread/fork",
  Effect.gen(function* () {
    const input = yield* readJsonBody<T3TeamThreadForkRequest>();
    const threadIdValue = input.threadId?.trim() ?? "";
    if (threadIdValue.length === 0) {
      return yield* new T3TeamAtlassianError({ message: "threadId is required." });
    }

    const threadId = ThreadId.make(threadIdValue);
    const query = yield* ProjectionSnapshotQuery;
    const orchestration = yield* OrchestrationEngineService;
    const contextStore = yield* T3TeamThreadToolContextStore;

    const parentThread = Option.getOrUndefined(yield* query.getThreadDetailById(threadId));
    if (!parentThread) {
      return yield* new T3TeamAtlassianError({ message: "Thread not found." });
    }

    const project = Option.getOrUndefined(yield* query.getProjectShellById(parentThread.projectId));
    if (!project) {
      return yield* new T3TeamAtlassianError({ message: "Project not found." });
    }

    // Branch point: copy up to and including the requested message, so a fork
    // made from a mid-thread message carries exactly the conversation so far.
    const upToMessageId = input.upToMessageId?.trim() ?? "";
    const parentMessages = upToMessageId
      ? parentThread.messages.slice(
          0,
          parentThread.messages.findIndex((message) => message.id === upToMessageId) + 1,
        )
      : parentThread.messages;
    if (upToMessageId && parentMessages.length === 0) {
      return yield* new T3TeamAtlassianError({
        message: "Fork failed because the requested message was not found in the thread.",
      });
    }

    // Keep the visible initial model/provider from the parent by default; the
    // provider reactor now allows a first-turn rebind for fork replay threads.
    const childModelSelection = parentThread.modelSelection ?? project.defaultModelSelection;
    if (!childModelSelection) {
      return yield* new T3TeamAtlassianError({
        message: "Fork failed because no model selection could be resolved.",
      });
    }

    const childTitle =
      typeof input.title === "string" && input.title.trim().length > 0
        ? input.title.trim()
        : `${parentThread.title} (fork)`;

    const childThreadId = ThreadId.make(t3teamRandomUUID());
    const createdAt = DateTime.formatIso(yield* DateTime.now);

    // Fork as a first-class top-level thread: visible in the same list as peers.
    yield* orchestration.dispatch({
      type: "thread.create",
      commandId: CommandId.make(`server:t3team:thread-fork:create:${t3teamRandomUUID()}`),
      threadId: childThreadId,
      projectId: parentThread.projectId,
      title: childTitle,
      modelSelection: childModelSelection,
      runtimeMode: parentThread.runtimeMode,
      interactionMode: parentThread.interactionMode,
      branch: parentThread.branch,
      worktreePath: parentThread.worktreePath,
      createdAt,
    });

    const parentToolContext = yield* contextStore.get(threadId);
    if (parentToolContext) {
      yield* contextStore.put({ threadId: childThreadId, toolContext: parentToolContext });
    }

    // First-class whole-thread copy: replay the parent thread artifacts into the
    // child thread. Long transcripts are middle-truncated to a fixed budget so
    // the fork fits any model's context; the provenance note sits between the
    // kept head and tail and keeps the original thread reachable via
    // t3team.thread.search_source.
    const tokenPlan = planForkTranscript(
      parentMessages.map((message) => message.id),
      new Map(parentMessages.map((message) => [message.id, estimateMessageTokens(message)])),
    );
    const resolveMessage = (id: string) => parentMessages.find((message) => message.id === id)!;

    const upsertMessage = (message: (typeof parentMessages)[number]) =>
      orchestration.dispatch({
        type: "thread.message.upsert",
        commandId: CommandId.make(`server:t3team:thread-fork:message:${t3teamRandomUUID()}`),
        threadId: childThreadId,
        message: {
          messageId: MessageId.make(`fork:${childThreadId}:${t3teamRandomUUID()}`),
          role: message.role,
          text: message.text,
          ...(message.attachments ? { attachments: message.attachments } : {}),
          ...(message.t3teamExt ? { t3teamExt: message.t3teamExt } : {}),
          // A fork keeps transcript content, but it must not inherit the parent's
          // active-turn/session linkage (that would keep provider switching locked).
          turnId: null,
          streaming: false,
        },
        createdAt: message.createdAt,
      });

    yield* Effect.forEach(tokenPlan.head, (id) => upsertMessage(resolveMessage(id)));

    if (tokenPlan.truncated) {
      const omitted = tokenPlan.omittedCount;
      yield* orchestration.dispatch({
        type: "thread.message.upsert",
        commandId: CommandId.make(`server:t3team:thread-fork:note:${t3teamRandomUUID()}`),
        threadId: childThreadId,
        message: {
          messageId: MessageId.make(`fork:${childThreadId}:note:${t3teamRandomUUID()}`),
          role: "system",
          text:
            `This thread was forked from \u201c${parentThread.title}\u201d. ` +
            `${omitted} middle message${omitted === 1 ? "" : "s"} of the original conversation ` +
            "were omitted to keep this thread's context small. Use the t3team.thread.search_source " +
            "tool to look anything up from the omitted range, or open the original thread for the full history.",
          turnId: null,
          streaming: false,
          t3teamExt: {
            forkSource: {
              threadId: threadIdValue,
              threadTitle: parentThread.title,
              omittedMessageCount: omitted,
            },
          },
        },
        createdAt,
      });
    }

    yield* Effect.forEach(tokenPlan.tail, (id) => upsertMessage(resolveMessage(id)));

    yield* Effect.forEach(parentThread.proposedPlans, (proposedPlan) =>
      orchestration.dispatch({
        type: "thread.proposed-plan.upsert",
        commandId: CommandId.make(`server:t3team:thread-fork:plan:${t3teamRandomUUID()}`),
        threadId: childThreadId,
        proposedPlan,
        createdAt: proposedPlan.createdAt,
      }),
    );

    yield* Effect.forEach(parentThread.activities, (activity) =>
      orchestration.dispatch({
        type: "thread.activity.append",
        commandId: CommandId.make(`server:t3team:thread-fork:activity:${t3teamRandomUUID()}`),
        threadId: childThreadId,
        activity: {
          ...activity,
          id: EventId.make(`fork:${childThreadId}:${t3teamRandomUUID()}`),
        },
        createdAt: activity.createdAt,
      }),
    );

    return okJson({
      ok: true,
      childThreadId,
    } satisfies T3TeamThreadForkResponse);
  }).pipe(Effect.mapError(toAtlassianError("Failed to fork thread.")), Effect.catch(errorResponse)),
);
