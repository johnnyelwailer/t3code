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
import { projectEvent } from "./orchestration/projector.ts";

const now = "2026-07-19T08:00:00.000Z";
const threadId = ThreadId.make("turn-admission-thread");

const readModel: OrchestrationReadModel = {
  snapshotSequence: 1,
  updatedAt: now,
  projects: [
    {
      id: ProjectId.make("turn-admission-project"),
      title: "Project",
      workspaceRoot: "/tmp/turn-admission",
      defaultModelSelection: null,
      scripts: [],
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    },
  ],
  threads: [
    {
      id: threadId,
      projectId: ProjectId.make("turn-admission-project"),
      title: "Thread",
      modelSelection: {
        instanceId: ProviderInstanceId.make("provider"),
        model: "model",
      },
      interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
      runtimeMode: "full-access",
      branch: null,
      worktreePath: null,
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
      latestTurn: null,
      messages: [],
      session: null,
      activities: [],
      proposedPlans: [],
      checkpoints: [],
      deletedAt: null,
    },
  ],
};

const command = {
  type: "thread.turn.start" as const,
  commandId: CommandId.make("turn-admission-command"),
  threadId,
  message: {
    messageId: MessageId.make("turn-admission-message"),
    role: "user" as const,
    text: "start",
    attachments: [],
  },
  runtimeMode: "full-access" as const,
  interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
  createdAt: now,
};

it.layer(NodeServices.layer)("thread turn admission", (it) => {
  it.effect.each(["starting", "running"] as const)(
    "rejects a turn while the session is %s",
    (status) =>
      Effect.gen(function* () {
        const busy = {
          ...readModel,
          threads: readModel.threads.map((thread) => ({
            ...thread,
            session: {
              threadId,
              status,
              providerName: null,
              runtimeMode: "full-access" as const,
              activeTurnId: null,
              lastError: null,
              updatedAt: now,
            },
          })),
        };
        const error = yield* Effect.flip(decideOrchestrationCommand({ command, readModel: busy }));
        expect(error.message).toContain("already has a turn in progress");
      }),
  );

  it.effect("rejects a turn while the latest projected turn is running", () =>
    Effect.gen(function* () {
      const busy = {
        ...readModel,
        threads: readModel.threads.map((thread) => ({
          ...thread,
          latestTurn: {
            turnId: TurnId.make("active-turn"),
            state: "running" as const,
            requestedAt: now,
            startedAt: now,
            completedAt: null,
            assistantMessageId: null,
          },
        })),
      };
      const error = yield* Effect.flip(decideOrchestrationCommand({ command, readModel: busy }));
      expect(error.message).toContain("already has a turn in progress");
    }),
  );

  it.effect("reserves admission before provider session startup is projected", () =>
    Effect.gen(function* () {
      const first = yield* decideOrchestrationCommand({ command, readModel });
      const events = Array.isArray(first) ? first : [first];
      let projected = readModel;
      for (const [index, event] of events.entries()) {
        projected = yield* projectEvent(projected, {
          ...event,
          sequence: projected.snapshotSequence + index + 1,
        });
      }
      const error = yield* Effect.flip(
        decideOrchestrationCommand({
          command: {
            ...command,
            commandId: CommandId.make("second-turn-admission-command"),
            message: {
              ...command.message,
              messageId: MessageId.make("second-turn-admission-message"),
            },
          },
          readModel: projected,
        }),
      );
      expect(error.message).toContain("already has a turn in progress");
    }),
  );
});
