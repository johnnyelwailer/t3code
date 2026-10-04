/**
 * Feeds the child-status summarizer from V2: every finished, meaningful turn
 * item of an app-owned subagent child (`shell.lineage.relationshipToParent:
 * "subagent"`, not a provider-native subagent) updates that child's
 * recent-activity window; the debounced summary is
 * written as the child's `childStatus` thread fact (side stream, never chat).
 *
 * Live tail only (`streamDomainEvents`): a status is a best-effort hint about
 * current work, so nothing is replayed after a restart; the next finished
 * item regenerates it.
 * @module t3team-childStatusReactor
 */
import {
  isProviderNativeSubagentThread,
  type OrchestrationV2DomainEvent,
  ThreadId,
} from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";

import { ThreadManagementService } from "./orchestration-v2/ThreadManagementService.ts";
import { forkParked } from "./serverActivation.ts";
import { TextGeneration } from "./textGeneration/TextGeneration.ts";
import {
  appendRecentActivity,
  type ChildActivity,
  childStatusPrompt,
  makeChildStatusSummarizer,
  turnItemActivity,
} from "./t3team-childStatusSummarizer.ts";
import { T3TeamThreadFactsStore } from "./t3team-v2/t3team-threadFactsStore.ts";
import { resolveWorkflowAgentModel } from "./t3team-workflowAgentModelPolicy.ts";

const ChildStatusOutput = Schema.Struct({ status: Schema.String });
/** Children whose recent activity is remembered; the oldest is dropped beyond this. */
const MAX_TRACKED_CHILDREN = 256;

export const T3TeamChildStatusReactorLive = Layer.effectDiscard(
  Effect.gen(function* () {
    const threads = yield* ThreadManagementService;
    const textGeneration = yield* TextGeneration;
    const facts = yield* T3TeamThreadFactsStore;
    const generateStructured = textGeneration.generateStructured;
    // Hosts without a structured-generation driver have no summaries (fail-open).
    if (generateStructured === undefined) return;

    const summarizer = yield* makeChildStatusSummarizer({
      debounce: "1500 millis",
      generate: ({ modelSelection, activity }) =>
        generateStructured({
          cwd: process.cwd(),
          prompt: childStatusPrompt(activity),
          outputSchema: ChildStatusOutput,
          modelSelection,
        }),
      persist: (threadId, status) =>
        facts.upsert(ThreadId.make(threadId), { childStatus: status }).pipe(Effect.asVoid),
      onFailure: (threadId, error) =>
        Effect.logWarning("t3team child status summary failed", { threadId, error }),
    });

    const recent = new Map<string, ReadonlyArray<ChildActivity>>();
    const handle = (event: OrchestrationV2DomainEvent) =>
      Effect.gen(function* () {
        if (event.type !== "turn-item.updated") return;
        const activity = turnItemActivity(event.payload);
        if (activity === null) return;
        const shell = yield* threads.getThreadShell(event.threadId);
        if (
          shell === null ||
          shell.lineage.parentThreadId === null ||
          shell.lineage.relationshipToParent !== "subagent" ||
          // The provider's own subagents are hidden and run inside the parent's turn: no summary.
          isProviderNativeSubagentThread(shell)
        ) {
          return;
        }
        const window = appendRecentActivity(recent.get(shell.id) ?? [], activity);
        recent.delete(shell.id);
        recent.set(shell.id, window);
        if (recent.size > MAX_TRACKED_CHILDREN) recent.delete(recent.keys().next().value!);
        yield* summarizer.note({
          threadId: shell.id,
          modelSelection: resolveWorkflowAgentModel(shell.modelSelection),
          activity: window,
        });
      });

    yield* forkParked(
      Stream.runForEach(threads.streamDomainEvents, (event) =>
        handle(event).pipe(
          Effect.catchCause((cause) =>
            Cause.hasInterruptsOnly(cause)
              ? Effect.interrupt
              : Effect.logWarning("t3team child status event failed", {
                  eventType: event.type,
                  cause: Cause.pretty(cause),
                }),
          ),
        ),
      ).pipe(
        Effect.catchCause((cause) =>
          Effect.logWarning("t3team child status stream ended", { cause: Cause.pretty(cause) }),
        ),
      ),
    );
  }),
);
