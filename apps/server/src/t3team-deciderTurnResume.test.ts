/**
 * t3team: `thread.turn.resume` — re-run the thread's last user message without
 * appending a new one (the "Continue" button for threads whose reply was lost).
 */
import {
  CommandId,
  DEFAULT_PROVIDER_INTERACTION_MODE,
  MessageId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  TurnId,
  type OrchestrationReadModel,
} from "@t3tools/contracts";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { decideOrchestrationCommand } from "./orchestration/decider.ts";

const now = "2026-08-24T08:00:00.000Z";
const threadId = ThreadId.make("turn-resume-thread");
const lastUserMessageId = MessageId.make("turn-resume-last-user");

const message = (id: string, role: "user" | "assistant") => ({
  id: MessageId.make(id),
  role,
  text: `${role} says`,
  attachments: [],
  turnId: null,
  streaming: false,
  createdAt: now,
  updatedAt: now,
});

const baseThread = {
  id: threadId,
  projectId: ProjectId.make("turn-resume-project"),
  title: "Thread",
  modelSelection: {
    instanceId: ProviderInstanceId.make("provider"),
    model: "model",
  },
  interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
  runtimeMode: "full-access" as const,
  branch: null,
  worktreePath: null,
  createdAt: now,
  updatedAt: now,
  archivedAt: null,
  settledOverride: null,
  settledAt: null,
  latestTurn: null,
  messages: [message("turn-resume-earlier", "assistant"), message("turn-resume-last-user", "user")],
  session: null,
  activities: [],
  proposedPlans: [],
  checkpoints: [],
  deletedAt: null,
};

const readModel: OrchestrationReadModel = {
  snapshotSequence: 1,
  updatedAt: now,
  projects: [
    {
      id: ProjectId.make("turn-resume-project"),
      title: "Project",
      workspaceRoot: "/tmp/turn-resume",
      defaultModelSelection: null,
      scripts: [],
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    },
  ],
  threads: [baseThread],
};

const withThread = (
  patch: Partial<OrchestrationReadModel["threads"][number]>,
): OrchestrationReadModel => ({
  ...readModel,
  threads: readModel.threads.map((thread) => ({ ...thread, ...patch })),
});

const command = {
  type: "thread.turn.resume" as const,
  commandId: CommandId.make("turn-resume-command"),
  threadId,
  messageId: lastUserMessageId,
  createdAt: now,
};

it.layer(NodeServices.layer)("thread turn resume", (it) => {
  it.effect("re-requests the last user message without appending a new one", () =>
    Effect.gen(function* () {
      const decided = yield* decideOrchestrationCommand({ command, readModel });
      const events = Array.isArray(decided) ? decided : [decided];
      expect(events).toHaveLength(1);
      const event = events[0]!;
      expect(event.type).toBe("thread.turn-start-requested");
      expect(events.map((entry) => entry.type)).not.toContain("thread.message-sent");
      const payload = event.payload as { messageId: string };
      expect(payload.messageId).toBe(lastUserMessageId);
    }),
  );

  it.effect("rejects when the thread does not end with a user message", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        decideOrchestrationCommand({
          command,
          readModel: withThread({
            messages: [
              message("turn-resume-user", "user"),
              message("turn-resume-reply", "assistant"),
            ],
          }),
        }),
      );
      expect(error.message).toContain("does not end with unanswered user message");
    }),
  );

  // Post-restart the rehydrated read model has messages: [] for every
  // pre-existing thread — exactly the lost-reply threads this feature exists
  // for. The decider must defer to the reactor's SQL-backed message lookup.
  it.effect("accepts when messages are not hydrated (post-restart read model)", () =>
    Effect.gen(function* () {
      const decided = yield* decideOrchestrationCommand({
        command,
        readModel: withThread({ messages: [] }),
      });
      const events = Array.isArray(decided) ? decided : [decided];
      expect(events.map((entry) => entry.type)).toEqual(["thread.turn-start-requested"]);
      const payload = events[0]!.payload as { messageId: string };
      expect(payload.messageId).toBe(lastUserMessageId);
    }),
  );

  it.effect("rejects a stale messageId that is no longer the last message", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        decideOrchestrationCommand({
          command: { ...command, messageId: MessageId.make("turn-resume-earlier") },
          readModel,
        }),
      );
      expect(error.message).toContain("does not end with unanswered user message");
    }),
  );

  it.effect("wakes a settled thread: resume emits thread.unsettled first", () =>
    Effect.gen(function* () {
      const decided = yield* decideOrchestrationCommand({
        command,
        readModel: withThread({ settledOverride: "settled" as const }),
      });
      const events = Array.isArray(decided) ? decided : [decided];
      expect(events.map((entry) => entry.type)).toEqual([
        "thread.unsettled",
        "thread.turn-start-requested",
      ]);
    }),
  );

  it.effect("rejects while a turn is in progress", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        decideOrchestrationCommand({
          command,
          readModel: withThread({
            latestTurn: {
              turnId: TurnId.make("active-turn"),
              state: "running" as const,
              requestedAt: now,
              startedAt: now,
              completedAt: null,
              assistantMessageId: null,
            },
          }),
        }),
      );
      expect(error.message).toContain("already has a turn in progress");
    }),
  );
});
