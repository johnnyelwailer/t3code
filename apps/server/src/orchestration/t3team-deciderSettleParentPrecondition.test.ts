import {
  CommandId,
  MessageId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  type OrchestrationReadModel,
  type OrchestrationThread,
} from "@t3tools/contracts";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { decideOrchestrationCommand } from "./decider.ts";

const NOW = "2026-01-01T00:00:00.000Z";

/**
 * Decide-time parent-settle precondition on `thread.settle`
 * (`requireSettledParentThreadId`): the child-settle sweeper's snapshot can
 * go stale between the read and the decision, so the decider re-verifies
 * the parent's CURRENT settled state against its own read model.
 */
function makeReadModel(
  parentOverride: OrchestrationThread["settledOverride"],
  parentPresent: boolean,
  childMessages: OrchestrationThread["messages"] = [],
): OrchestrationReadModel {
  const child: OrchestrationThread = {
    id: ThreadId.make("child-1"),
    projectId: ProjectId.make("project-1"),
    title: "Child",
    modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5.4" },
    runtimeMode: "full-access",
    interactionMode: "default",
    branch: null,
    worktreePath: null,
    latestTurn: null,
    createdAt: NOW,
    updatedAt: NOW,
    archivedAt: null,
    settledOverride: null,
    settledAt: null,
    snoozedUntil: null,
    snoozedAt: null,
    pinnedAt: null,
    deletedAt: null,
    messages: childMessages,
    proposedPlans: [],
    activities: [],
    checkpoints: [],
    session: null,
  };
  const threads: OrchestrationThread[] = [child];
  if (parentPresent) {
    threads.push({
      ...child,
      id: ThreadId.make("parent-1"),
      title: "Parent",
      settledOverride: parentOverride,
      settledAt: parentOverride === "settled" ? NOW : null,
    });
  }
  return { snapshotSequence: 0, projects: [], threads, updatedAt: NOW };
}

const settleWithPrecondition = {
  type: "thread.settle" as const,
  commandId: CommandId.make("cmd-sweeper-settle"),
  threadId: ThreadId.make("child-1"),
  requireSettledParentThreadId: ThreadId.make("parent-1"),
};

it.layer(NodeServices.layer)("settled-parent settle precondition", (it) => {
  it.effect("settles the child when the parent is settled at decide time", () =>
    Effect.gen(function* () {
      const result = yield* decideOrchestrationCommand({
        command: settleWithPrecondition,
        readModel: makeReadModel("settled", true),
      });
      const events = Array.isArray(result) ? result : [result];
      const settled = events.find((event) => event.type === "thread.settled");
      expect(settled?.payload.threadId).toBe("child-1");
    }),
  );

  it.effect("refuses when the parent un-settled (pinned active) before the decision", () =>
    Effect.gen(function* () {
      const blocked = yield* decideOrchestrationCommand({
        command: settleWithPrecondition,
        readModel: makeReadModel("active", true),
      }).pipe(Effect.flip);
      expect(blocked._tag).toBe("OrchestrationThreadSettleBlockedError");
    }),
  );

  it.effect("refuses when the parent un-settled (activity) before the decision", () =>
    Effect.gen(function* () {
      const blocked = yield* decideOrchestrationCommand({
        command: settleWithPrecondition,
        readModel: makeReadModel(null, true),
      }).pipe(Effect.flip);
      expect(blocked._tag).toBe("OrchestrationThreadSettleBlockedError");
    }),
  );

  it.effect("refuses when the parent is absent from the read model", () =>
    Effect.gen(function* () {
      const blocked = yield* decideOrchestrationCommand({
        command: settleWithPrecondition,
        readModel: makeReadModel(null, false),
      }).pipe(Effect.flip);
      expect(blocked._tag).toBe("OrchestrationThreadSettleBlockedError");
    }),
  );

  it.effect("without the precondition the settle behaves exactly as before", () =>
    Effect.gen(function* () {
      const result = yield* decideOrchestrationCommand({
        command: {
          type: "thread.settle",
          commandId: CommandId.make("cmd-plain-settle"),
          threadId: ThreadId.make("child-1"),
        },
        readModel: makeReadModel("active", true), // parent un-settled: irrelevant without the precondition
      });
      const events = Array.isArray(result) ? result : [result];
      expect(events.find((event) => event.type === "thread.settled")?.payload.threadId).toBe(
        "child-1",
      );
    }),
  );

  // The decider is the single authoritative live-work gate: a queued turn
  // start — a user message no turn has adopted yet, inside the 2-minute
  // grace window — must block a plain `thread.settle` just as it blocks
  // `thread.auto-settle`. Pins the sweep's exact combination: settled parent
  // precondition satisfied, yet the child has just-received work.
  it.effect("refuses a plain thread.settle while a turn start is queued", () =>
    Effect.gen(function* () {
      // The decider's clock is the pinned Effect test clock (epoch), so the
      // user message lands 30s before the epoch — inside the grace window.
      const queuedUserMessage: OrchestrationThread["messages"][number] = {
        id: MessageId.make("message-queued"),
        role: "user",
        text: "Continue",
        turnId: null,
        streaming: false,
        createdAt: "1969-12-31T23:59:30.000Z",
        updatedAt: "1969-12-31T23:59:30.000Z",
      };
      const blocked = yield* decideOrchestrationCommand({
        command: settleWithPrecondition,
        readModel: makeReadModel("settled", true, [queuedUserMessage]),
      }).pipe(Effect.flip);
      expect(blocked._tag).toBe("OrchestrationThreadSettleBlockedError");
    }),
  );
});
