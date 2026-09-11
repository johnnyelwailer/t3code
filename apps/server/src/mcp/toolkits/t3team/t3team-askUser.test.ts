import { expect, it } from "@effect/vitest";
import {
  EnvironmentId,
  ProviderInstanceId,
  ThreadId,
  type OrchestrationCommand,
  type OrchestrationEvent,
} from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as Queue from "effect/Queue";
import * as Stream from "effect/Stream";
import { McpSchema, McpServer } from "effect/unstable/ai";

import {
  OrchestrationEngineService,
  type OrchestrationEngineShape,
} from "../../../orchestration/Services/OrchestrationEngine.ts";
import { T3TeamToolBroker, type T3TeamToolBinding } from "../../../t3team-toolBroker.ts";
import { T3TeamToolkitRegistrationLive } from "../../McpHttpServer.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
import { t3TeamAskUser } from "./askUser.ts";
import { T3TeamMcpToolError } from "./tools.ts";

const threadId = ThreadId.make("thread-ask-user-test");
const otherThreadId = ThreadId.make("thread-ask-user-other");
const otherRequestId = "request-other";
const ANSWERS = { "Pick a database": "Postgres" };

const makeAnswerEvent = (
  forThreadId: ThreadId,
  requestId: string,
  answers: Record<string, unknown>,
): OrchestrationEvent =>
  ({
    sequence: 1,
    aggregateKind: "thread",
    aggregateId: forThreadId,
    commandId: "command-answer",
    occurredAt: "2026-01-01T00:00:00.000Z",
    type: "thread.user-input-response-requested",
    payload: {
      threadId: forThreadId,
      requestId,
      answers,
      createdAt: "2026-01-01T00:00:00.000Z",
    },
  }) as unknown as OrchestrationEvent;

interface ActivityRecord {
  readonly kind: string;
  readonly summary: string;
  readonly payload: Record<string, unknown>;
  readonly threadId: string;
}

const readActivities = (commands: OrchestrationCommand[]): ActivityRecord[] =>
  commands.flatMap((command) => {
    if (command.type !== "thread.activity.append") return [];
    return [
      {
        kind: command.activity.kind,
        summary: command.activity.summary,
        payload: command.activity.payload as Record<string, unknown>,
        threadId: command.threadId,
      },
    ];
  });

/** Read a recorded activity by position, failing loudly if it is missing. */
const activityAt = (commands: OrchestrationCommand[], index: number): ActivityRecord => {
  const found = readActivities(commands)[index];
  if (found === undefined) {
    throw new Error(
      `expected an activity at index ${index}, but only ${readActivities(commands).length} were recorded`,
    );
  }
  return found;
};

interface FakeEngine {
  readonly shape: OrchestrationEngineShape;
  readonly commands: OrchestrationCommand[];
}

/**
 * Records every dispatch. When a `user-input.requested` activity lands,
 * answers it on the domain-event stream the way the composer's
 * `thread.user-input.respond` command would (optionally after emitting
 * decoy events the handler must ignore).
 */
const makeFakeEngine = (config?: {
  readonly answers?: Record<string, unknown>;
  readonly autoAnswer?: boolean;
  /** Shut the answer stream down when the question lands, so it ends without an answer. */
  readonly endStream?: boolean;
  readonly decoys?: Array<(offer: (event: OrchestrationEvent) => void) => void>;
}): FakeEngine => {
  const commands: OrchestrationCommand[] = [];
  const state: {
    queue: Queue.Queue<OrchestrationEvent> | undefined;
    hold: Deferred.Deferred<void> | undefined;
  } = { queue: undefined, hold: undefined };
  const answers = config?.answers ?? ANSWERS;
  const shape: OrchestrationEngineShape = {
    readEvents: () => Stream.empty,
    streamDomainEvents: Stream.empty,
    dispatch: (command) =>
      Effect.gen(function* () {
        commands.push(command);
        if (
          command.type === "thread.activity.append" &&
          command.activity.kind === "user-input.requested" &&
          state.queue &&
          config?.autoAnswer !== false
        ) {
          const payload = command.activity.payload as Record<string, unknown>;
          const requestId = String(payload.requestId);
          const offer = (event: OrchestrationEvent) => Queue.offer(state.queue!, event);
          for (const decoy of config?.decoys ?? []) {
            decoy(offer);
          }
          yield* Queue.offer(state.queue, makeAnswerEvent(command.threadId, requestId, answers));
        }
        if (
          command.type === "thread.activity.append" &&
          command.activity.kind === "user-input.requested" &&
          state.hold
        ) {
          // End the subscription cleanly after the question is on the thread.
          yield* Deferred.succeed(state.hold, undefined);
        }
        return { sequence: commands.length };
      }),
    subscribeDomainEvents: Effect.gen(function* () {
      if (config?.endStream) {
        const hold = Deferred.makeUnsafe<void>();
        state.hold = hold;
        // Ends cleanly (zero elements) once the question has been published —
        // the "provider session went away" case.
        return Stream.fromEffectDrain(Deferred.await(hold));
      }
      const queue = yield* Queue.unbounded<OrchestrationEvent>();
      state.queue = queue;
      return Stream.fromQueue(queue);
    }),
    latestSequence: Effect.succeed(0),
  };
  return { shape, commands };
};

const provideEngine = <A, E, R>(effect: Effect.Effect<A, E, R>, engine: OrchestrationEngineShape) =>
  effect.pipe(Effect.provideService(OrchestrationEngineService, engine));

it.effect("appends user-input.requested, suspends, and returns the submitted answers", () =>
  Effect.gen(function* () {
    const fake = makeFakeEngine();
    const result = yield* provideEngine(
      t3TeamAskUser({ question: "Pick a database", options: ["Postgres", "SQLite"] }, threadId),
      fake.shape,
    );

    expect(result.question).toBe("Pick a database");
    expect(result.answers).toEqual(ANSWERS);

    const activities = readActivities(fake.commands);
    expect(activities).toHaveLength(2);

    const requested = activityAt(fake.commands, 0);
    expect(requested.kind).toBe("user-input.requested");
    expect(requested.summary).toBe("User input requested");
    expect(requested.threadId).toBe(threadId);
    expect(requested.payload.requestId).toBe(result.requestId);
    const questions = (requested.payload.questions ?? []) as Array<Record<string, unknown>>;
    expect(questions).toEqual([
      {
        id: "Pick a database",
        header: "Question",
        question: "Pick a database",
        options: [
          { label: "Postgres", description: "Postgres" },
          { label: "SQLite", description: "SQLite" },
        ],
        multiSelect: false,
      },
    ]);

    const resolved = activityAt(fake.commands, 1);
    expect(resolved.kind).toBe("user-input.resolved");
    expect(resolved.summary).toBe("User input submitted");
    expect(resolved.payload.requestId).toBe(result.requestId);
    expect(resolved.payload.answers).toEqual(ANSWERS);
  }),
);

it.effect("ignores answer events for other threads or request ids", () =>
  Effect.gen(function* () {
    const fake = makeFakeEngine({
      answers: ANSWERS,
      decoys: [
        (offer) => offer(makeAnswerEvent(threadId, otherRequestId, { decoy: "other-request" })),
        (offer) => offer(makeAnswerEvent(otherThreadId, "request-x", { decoy: "other-thread" })),
      ],
    });
    const result = yield* provideEngine(
      t3TeamAskUser({ question: "Pick a database" }, threadId),
      fake.shape,
    );

    expect(result.answers).toEqual(ANSWERS);
    const requested = activityAt(fake.commands, 0);
    const resolved = activityAt(fake.commands, 1);
    expect(resolved.payload.requestId).toBe(requested.payload.requestId);
    expect(resolved.payload.answers).toEqual(ANSWERS);
  }),
);

it.effect("maps multiSelect and allowFreeText into the requested activity", () =>
  Effect.gen(function* () {
    const fake = makeFakeEngine({ answers: { "Pick flavors": ["choc", "van"] } });
    yield* provideEngine(
      t3TeamAskUser(
        {
          question: "Pick flavors",
          options: ["choc", "van"],
          multiSelect: true,
          allowFreeText: false,
        },
        threadId,
      ),
      fake.shape,
    );

    const requested = activityAt(fake.commands, 0);
    const questions = (requested.payload.questions ?? []) as Array<Record<string, unknown>>;
    expect(questions).toHaveLength(1);
    expect(questions[0]?.multiSelect).toBe(true);
    expect(requested.payload.allowFreeText).toBe(false);
  }),
);

it.effect("rejects an empty question without touching the thread", () =>
  Effect.gen(function* () {
    const fake = makeFakeEngine();
    const exit = yield* provideEngine(
      t3TeamAskUser({ question: "   " }, threadId),
      fake.shape,
    ).pipe(Effect.exit);

    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      expect(Cause.squash(exit.cause)).toBeInstanceOf(T3TeamMcpToolError);
    }
    expect(fake.commands).toEqual([]);
  }),
);

it.effect(
  "closes the question with a cancelled user-input.resolved when the subscription ends without an answer",
  () =>
    Effect.gen(function* () {
      // The answer stream ends (e.g. the provider session closed while the
      // user was still deciding) without ever delivering an answer for this
      // requestId; the tool must close the pending question instead of
      // hanging the turn.
      const fake = makeFakeEngine({ autoAnswer: false, endStream: true });
      const result = yield* provideEngine(
        t3TeamAskUser({ question: "Session goes away" }, threadId),
        fake.shape,
      );

      expect(result.question).toBe("Session goes away");
      expect(result.answers).toEqual({});

      const activities = readActivities(fake.commands);
      expect(activities.map((activity) => activity.kind)).toEqual([
        "user-input.requested",
        "user-input.resolved",
      ]);
      const requested = activityAt(fake.commands, 0);
      const cancelled = activityAt(fake.commands, 1);
      expect(cancelled.summary).toBe("User input cancelled");
      expect(cancelled.payload.requestId).toBe(requested.payload.requestId);
      expect(cancelled.payload.answers).toEqual({});
    }),
);

// Wiring check through the real MCP registration layer: t3team_ask_user must
// resolve to the ask-user handler (not the broker callTool dispatch) and
// surface the tool result as structured content.
const invocation: McpInvocationContext.McpInvocationScope = {
  environmentId: EnvironmentId.make("environment-ask-user-test"),
  threadId,
  providerSessionId: "provider-session-ask-user-test",
  providerInstanceId: ProviderInstanceId.make("pack-ask-user-test"),
  capabilities: new Set(),
  issuedAt: 1,
};
const client = McpSchema.McpServerClient.of({
  clientId: 1,
  protocolVersion: "2025-06-18",
  initializePayload: {
    protocolVersion: "2025-03-26",
    capabilities: {},
    clientInfo: { name: "t3team-ask-user-mcp-test", version: "1.0.0" },
  },
  getClient: Effect.die("unused"),
});

it.effect("routes t3team_ask_user through the MCP toolkit to the ask-user handler", () => {
  const fake = makeFakeEngine();
  const unusedBinding: T3TeamToolBinding = {
    threadId,
    listServers: () => [],
    readResource: ({ uri }) => Effect.succeed({ contents: [{ uri, text: "{}" }] }),
    callTool: () => Effect.succeed({ content: [{ type: "text" as const, text: "ok" }] }),
  };
  const broker = T3TeamToolBroker.of({
    sendMessage: () => Effect.succeed(undefined),
    bindSession: ({ threadId: boundThreadId }) =>
      Effect.succeed(boundThreadId === threadId ? unusedBinding : undefined),
    bindReadOnly: () => Effect.void.pipe(Effect.as(undefined)),
  });
  const TestLayer = T3TeamToolkitRegistrationLive.pipe(
    Layer.provideMerge(McpServer.McpServer.layer),
    Layer.provideMerge(Layer.succeed(T3TeamToolBroker, broker)),
    Layer.provideMerge(Layer.succeed(OrchestrationEngineService, fake.shape)),
  );

  return Effect.gen(function* () {
    const server = yield* McpServer.McpServer;
    const result = yield* server.callTool({
      name: "t3team_ask_user",
      arguments: { question: "Continue?", options: ["Yes", "No"] },
    });

    expect(result.isError).toBe(false);
    const structured = result.structuredContent as Record<string, unknown>;
    expect(structured.question).toBe("Continue?");
    expect(structured.answers).toEqual(ANSWERS);
    const activities = readActivities(fake.commands);
    expect(activities.map((activity) => activity.kind)).toEqual([
      "user-input.requested",
      "user-input.resolved",
    ]);
  }).pipe(
    Effect.provideService(McpInvocationContext.McpInvocationContext, invocation),
    Effect.provideService(McpSchema.McpServerClient, client),
    Effect.provide(TestLayer),
  );
});
