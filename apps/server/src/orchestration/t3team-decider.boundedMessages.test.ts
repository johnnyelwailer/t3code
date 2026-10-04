import {
  CommandId,
  MessageId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  TurnId,
  type OrchestrationLatestTurn,
  type OrchestrationReadModel,
  type OrchestrationThread,
} from "@t3tools/contracts";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { decideOrchestrationCommand } from "./decider.ts";

// The OOM fix bounds the decider's command read model at boot: a thread's
// `messages` array holds only the LAST user message and the LAST assistant
// message (plus streaming state), never the full history. These tests pin the
// message-shape invariants against EXACTLY that bounded shape, proving the
// decider still behaves correctly when the full-text history is not resident.

const NOW = "2026-04-06T00:00:00.000Z";

const LAST_USER = MessageId.make("msg-last-user");
const LAST_ASSISTANT = MessageId.make("msg-last-assistant");

// The bounded tail as the boot read model now produces it: last user, then
// last assistant, in natural order.
const boundedMessages: OrchestrationThread["messages"] = [
  {
    id: LAST_USER,
    role: "user",
    text: "last user question",
    turnId: null,
    streaming: false,
    createdAt: "2026-04-06T00:00:04.000Z",
    updatedAt: "2026-04-06T00:00:04.000Z",
  },
  {
    id: LAST_ASSISTANT,
    role: "assistant",
    text: "partial reply (aborted)",
    turnId: TurnId.make("turn-1"),
    streaming: false,
    createdAt: "2026-04-06T00:00:05.000Z",
    updatedAt: "2026-04-06T00:00:05.000Z",
  },
];

const interruptedTurn: OrchestrationLatestTurn = {
  turnId: TurnId.make("turn-1"),
  state: "interrupted",
  requestedAt: "2026-04-06T00:00:04.000Z",
  startedAt: "2026-04-06T00:00:04.100Z",
  completedAt: null,
  assistantMessageId: LAST_ASSISTANT,
};

function makeBoundedReadModel(
  latestTurn: OrchestrationThread["latestTurn"],
): OrchestrationReadModel {
  const thread: OrchestrationThread = {
    id: ThreadId.make("thread-1"),
    projectId: ProjectId.make("project-1"),
    title: "Thread",
    modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5.4" },
    runtimeMode: "full-access",
    interactionMode: "default",
    branch: null,
    worktreePath: null,
    pullRequests: [],
    latestTurn,
    turnStartPending: false,
    createdAt: NOW,
    updatedAt: NOW,
    archivedAt: null,
    settledOverride: null,
    settledAt: null,
    snoozedUntil: null,
    snoozedAt: null,
    deletedAt: null,
    messages: boundedMessages,
    proposedPlans: [],
    activities: [],
    checkpoints: [],
    session: null,
  };
  return { snapshotSequence: 0, projects: [], threads: [thread], updatedAt: NOW };
}

it.layer(NodeServices.layer)("decider with a bounded command read model", (it) => {
  it.effect(
    "resumes the last user message read from the bounded tail when the last turn is incomplete",
    () =>
      Effect.gen(function* () {
        const event = yield* decideOrchestrationCommand({
          command: {
            type: "thread.turn.resume",
            commandId: CommandId.make("cmd-resume"),
            threadId: ThreadId.make("thread-1"),
            messageId: LAST_USER,
            createdAt: NOW,
          },
          readModel: makeBoundedReadModel(interruptedTurn),
        });
        const events = Array.isArray(event) ? event : [event];
        expect(events).toHaveLength(1);
        expect(events[0]?.type).toBe("thread.turn-start-requested");
        if (events[0]?.type === "thread.turn-start-requested") {
          expect(events[0].payload.messageId).toBe(LAST_USER);
        }
      }),
  );

  it.effect(
    "still rejects a resume that does not target the bounded tail's last user message",
    () =>
      Effect.gen(function* () {
        const error = yield* decideOrchestrationCommand({
          command: {
            type: "thread.turn.resume",
            commandId: CommandId.make("cmd-resume-wrong"),
            threadId: ThreadId.make("thread-1"),
            messageId: MessageId.make("msg-not-last-user"),
            createdAt: NOW,
          },
          readModel: makeBoundedReadModel(interruptedTurn),
        }).pipe(Effect.flip);
        expect(error._tag).toBe("OrchestrationCommandInvariantError");
      }),
  );

  it.effect(
    "does not re-emit the user message on turn start when it is already in the bounded tail",
    () =>
      Effect.gen(function* () {
        const event = yield* decideOrchestrationCommand({
          command: {
            type: "thread.turn.start",
            commandId: CommandId.make("cmd-turn-start"),
            threadId: ThreadId.make("thread-1"),
            message: {
              messageId: LAST_USER,
              role: "user",
              text: "last user question",
              attachments: [],
            },
            runtimeMode: "full-access",
            interactionMode: "default",
            createdAt: NOW,
          },
          readModel: makeBoundedReadModel(interruptedTurn),
        });
        const events = Array.isArray(event) ? event : [event];
        // The persisted last-user message is found in the bounded tail, so only
        // the turn-start is emitted — no synthetic thread.message-sent.
        expect(events).toHaveLength(1);
        expect(events[0]?.type).toBe("thread.turn-start-requested");
        if (events[0]?.type === "thread.turn-start-requested") {
          expect(events[0].payload.messageId).toBe(LAST_USER);
        }
      }),
  );
});
