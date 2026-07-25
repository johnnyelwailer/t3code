import {
  CommandId,
  DEFAULT_PROVIDER_INTERACTION_MODE,
  EventId,
  MessageId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  TurnId,
  type OrchestrationEvent,
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
      settledOverride: null,
      settledAt: null,
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

// Distributive so each event keeps its own discriminated payload shape.
type UnsequencedEvent = OrchestrationEvent extends infer Event
  ? Event extends OrchestrationEvent
    ? Omit<Event, "sequence">
    : never
  : never;

const projectAll = (base: OrchestrationReadModel, events: ReadonlyArray<UnsequencedEvent>) =>
  Effect.gen(function* () {
    let projected = base;
    for (const [index, event] of events.entries()) {
      projected = yield* projectEvent(projected, {
        ...event,
        sequence: base.snapshotSequence + index + 1,
      });
    }
    return projected;
  });

const secondCommand = {
  ...command,
  commandId: CommandId.make("second-turn-admission-command"),
  message: {
    ...command.message,
    messageId: MessageId.make("second-turn-admission-message"),
  },
};

const automatedCommand = {
  ...command,
  commandId: CommandId.make("automated-turn-admission-command"),
  message: {
    ...command.message,
    messageId: MessageId.make("automated-turn-admission-message"),
    // Only fork-side automated senders stamp an author; a typed user message
    // never carries one. That is what admission discriminates on.
    t3teamExt: {
      author: {
        kind: "actor" as const,
        threadId: "sender-thread",
        projectId: "turn-admission-project",
        title: "Sender",
      },
    },
  },
};

const withThread = (
  patch: Partial<OrchestrationReadModel["threads"][number]>,
): OrchestrationReadModel => ({
  ...readModel,
  threads: readModel.threads.map((thread) => ({ ...thread, ...patch })),
});

const runningSession = {
  threadId,
  status: "running" as const,
  providerName: null,
  runtimeMode: "full-access" as const,
  activeTurnId: TurnId.make("active-turn"),
  lastError: null,
  updatedAt: now,
};

const startingSession = { ...runningSession, status: "starting" as const, activeTurnId: null };

const runningLatestTurn = {
  turnId: TurnId.make("active-turn"),
  state: "running" as const,
  requestedAt: now,
  startedAt: now,
  completedAt: null,
  assistantMessageId: null,
};

it.layer(NodeServices.layer)("thread turn admission", (it) => {
  // A user message sent into a turn the provider already owns is a *steer*, not
  // a double-submit: the adapters fold it into the running turn and the shell
  // composer stays enabled mid-turn. Upstream admits these unconditionally, so
  // admission must never reject one, whatever the session is doing.
  it.effect.each([
    ["a starting session", { session: startingSession }],
    ["a running session", { session: runningSession }],
    ["a running latest turn", { latestTurn: runningLatestTurn }],
    ["an outstanding reservation", { turnStartPending: true }],
  ] as const)("admits a user turn with %s", ([, patch]) =>
    Effect.gen(function* () {
      const decided = yield* decideOrchestrationCommand({
        command,
        readModel: withThread(patch),
      });
      const events = Array.isArray(decided) ? decided : [decided];
      expect(events.map((event) => event.type)).toContain("thread.turn-start-requested");
    }),
  );

  // The HIGH finding this guard exists for: actor delivery, a workflow step and
  // a child kickoff must not race each other onto one thread.
  it.effect.each([
    ["a starting session", { session: startingSession }],
    ["a running session", { session: runningSession }],
    ["a running latest turn", { latestTurn: runningLatestTurn }],
    ["an outstanding reservation", { turnStartPending: true }],
  ] as const)("rejects an automated turn with %s", ([, patch]) =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        decideOrchestrationCommand({ command: automatedCommand, readModel: withThread(patch) }),
      );
      expect(error.message).toContain("already has a turn in progress");
    }),
  );

  it.effect("admits an automated turn on an idle thread", () =>
    Effect.gen(function* () {
      const decided = yield* decideOrchestrationCommand({ command: automatedCommand, readModel });
      const events = Array.isArray(decided) ? decided : [decided];
      expect(events.map((event) => event.type)).toContain("thread.turn-start-requested");
    }),
  );

  // Regression guard for upstream's "Preserve connecting status while a turn
  // starts" (#4101). The projector clears `turnStartPending` on ANY
  // `thread.session-set`, and since #4101 the reactor emits one at the START of
  // a turn start with status "starting". So the reservation flag alone no longer
  // covers provider startup — the "starting" status is what covers it, and a
  // second automated start during that window must still be rejected.
  it.effect("rejects an automated turn during provider startup after the flag clears", () =>
    Effect.gen(function* () {
      const first = yield* decideOrchestrationCommand({ command, readModel });
      const reserved = yield* projectAll(readModel, Array.isArray(first) ? first : [first]);
      const startingUp = yield* projectEvent(reserved, {
        eventId: EventId.make("00000000-0000-4000-8000-000000000001"),
        sequence: reserved.snapshotSequence + 1,
        aggregateKind: "thread",
        aggregateId: threadId,
        occurredAt: now,
        commandId: CommandId.make("turn-admission-session-set"),
        causationEventId: null,
        correlationId: null,
        metadata: {},
        type: "thread.session-set",
        payload: { threadId, session: startingSession },
      });

      const thread = startingUp.threads.find((entry) => entry.id === threadId);
      expect(thread?.turnStartPending).not.toBe(true);
      expect(thread?.session?.status).toBe("starting");

      const error = yield* Effect.flip(
        decideOrchestrationCommand({ command: automatedCommand, readModel: startingUp }),
      );
      expect(error.message).toContain("already has a turn in progress");
    }),
  );

  // ...and the same window must stay open to the user.
  it.effect("still admits a user turn during provider startup", () =>
    Effect.gen(function* () {
      const decided = yield* decideOrchestrationCommand({
        command: secondCommand,
        readModel: withThread({ session: startingSession, turnStartPending: false }),
      });
      const events = Array.isArray(decided) ? decided : [decided];
      expect(events.map((event) => event.type)).toContain("thread.turn-start-requested");
    }),
  );
});
