import { expect, it } from "@effect/vitest";
import {
  EnvironmentId,
  EventId,
  ProviderInstanceId,
  ThreadId,
  type OrchestrationCommand,
} from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";
import { McpSchema, McpServer } from "effect/unstable/ai";

import {
  OrchestrationEngineService,
  type OrchestrationEngineShape,
} from "../../../orchestration/Services/OrchestrationEngine.ts";
import {
  ProjectionThreadActivityRepository,
  type ProjectionThreadActivity,
  type ProjectionThreadActivityRepositoryShape,
} from "../../../persistence/Services/ProjectionThreadActivities.ts";
import { T3TeamToolBroker, type T3TeamToolBinding } from "../../../t3team-toolBroker.ts";
import { T3TeamToolkitRegistrationLive } from "../../McpHttpServer.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
import { t3TeamAskUser } from "./t3team-askUser.ts";
import { T3TeamMcpToolError } from "./tools.ts";

const threadId = ThreadId.make("thread-ask-user-test");

// ── Fakes ────────────────────────────────────────────────────────────────────

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

/** Records every dispatch; never answers — the message-mode tool must not suspend. */
const makeRecordingEngine = (): {
  readonly shape: OrchestrationEngineShape;
  readonly commands: OrchestrationCommand[];
} => {
  const commands: OrchestrationCommand[] = [];
  const shape: OrchestrationEngineShape = {
    readEvents: () => Stream.empty,
    streamDomainEvents: Stream.empty,
    readThreadEvents: () => Stream.empty,
    getThreadReplayStats: () => Effect.die("unused"),
    dispatch: (command) =>
      Effect.gen(function* () {
        commands.push(command);
        return { sequence: commands.length };
      }),
    subscribeDomainEvents: Effect.succeed(Stream.empty),
    latestSequence: Effect.succeed(0),
  };
  return { shape, commands };
};

const activityRow = (
  sequence: number,
  kind: string,
  payload: Record<string, unknown>,
): ProjectionThreadActivity =>
  ({
    activityId: EventId.make(`activity-${sequence}`),
    threadId,
    turnId: null,
    tone: "info",
    kind,
    summary: "fixture",
    payload,
    sequence,
    createdAt: `2026-01-01T00:00:0${sequence}.000Z`,
  }) satisfies ProjectionThreadActivity;

const makeRepository = (rows: ReadonlyArray<ProjectionThreadActivity>) =>
  ({
    upsert: () => Effect.die("unused"),
    listByThreadId: () => Effect.die("unused"),
    listUserInputLifecycleByThreadId: () => Effect.succeed(rows),
    deleteByThreadId: () => Effect.die("unused"),
  }) satisfies ProjectionThreadActivityRepositoryShape;

const provideAskUser = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
  engine: OrchestrationEngineShape,
  repository: ProjectionThreadActivityRepositoryShape,
) =>
  effect.pipe(
    Effect.provideService(OrchestrationEngineService, engine),
    Effect.provideService(ProjectionThreadActivityRepository, repository),
  );

// ── Behavior ─────────────────────────────────────────────────────────────────

it.effect("appends a message-mode user-input.requested and returns immediately", () =>
  Effect.gen(function* () {
    const fake = makeRecordingEngine();
    const result = yield* provideAskUser(
      t3TeamAskUser({ question: "Pick a database", options: ["Postgres", "SQLite"] }, threadId),
      fake.shape,
      makeRepository([]),
    );

    expect(result).toMatchObject({
      delivered: true,
      questionId: result.requestId,
    });

    const activities = readActivities(fake.commands);
    expect(activities).toHaveLength(1);
    const requested = activityAt(fake.commands, 0);
    expect(requested.kind).toBe("user-input.requested");
    expect(requested.summary).toBe("User input requested");
    expect(requested.threadId).toBe(threadId);
    expect(requested.payload.requestId).toBe(result.requestId);
    expect(requested.payload.responseMode).toBe("message");
    const questions = (requested.payload.questions ?? []) as Array<Record<string, unknown>>;
    expect(questions).toEqual([
      {
        // id is the requestId — a short identifier, not the question text.
        id: result.requestId,
        header: "Question",
        question: "Pick a database",
        options: [
          { label: "Postgres", description: "Postgres" },
          { label: "SQLite", description: "SQLite" },
        ],
        multiSelect: false,
      },
    ]);

    // No user-input.resolved: only the user's answer may close the question.
    expect(activities.map((activity) => activity.kind)).toEqual(["user-input.requested"]);
  }),
);

it.effect("maps multiSelect and allowFreeText:false onto the question", () =>
  Effect.gen(function* () {
    const fake = makeRecordingEngine();
    yield* provideAskUser(
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
      makeRepository([]),
    );

    const requested = activityAt(fake.commands, 0);
    const questions = (requested.payload.questions ?? []) as Array<Record<string, unknown>>;
    expect(questions[0]?.multiSelect).toBe(true);
    // allowFreeText lived on the payload where nothing consumed it; the
    // composer reads allowCustomAnswer on the question.
    expect(questions[0]?.allowCustomAnswer).toBe(false);
    expect(requested.payload.allowFreeText).toBeUndefined();
  }),
);

it.effect("omits allowCustomAnswer when free text stays allowed", () =>
  Effect.gen(function* () {
    const fake = makeRecordingEngine();
    yield* provideAskUser(
      t3TeamAskUser({ question: "Pick flavors", allowFreeText: true }, threadId),
      fake.shape,
      makeRepository([]),
    );
    const requested = activityAt(fake.commands, 0);
    const questions = (requested.payload.questions ?? []) as Array<Record<string, unknown>>;
    expect(questions[0]?.allowCustomAnswer).toBeUndefined();
  }),
);

it.effect("maps header and structured options; warns when a description restates its label", () =>
  Effect.gen(function* () {
    const fake = makeRecordingEngine();
    const result = yield* provideAskUser(
      t3TeamAskUser(
        {
          question: "Pick a direction",
          header: "CR header",
          options: [
            "Drop the header (recommended)",
            { label: "Keep it", description: "Preserves the observed UX; costs a render pass" },
            { label: "", description: "blank label is dropped" },
          ],
        },
        threadId,
      ),
      fake.shape,
      makeRepository([]),
    );

    expect(result.delivered).toBe(true);
    // The string option has no distinct description, so it warns.
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings?.[0]).toContain("Drop the header (recommended)");

    const requested = activityAt(fake.commands, 0);
    const questions = (requested.payload.questions ?? []) as Array<Record<string, unknown>>;
    expect(questions[0]?.header).toBe("CR header");
    expect(questions[0]?.options).toEqual([
      { label: "Drop the header (recommended)", description: "Drop the header (recommended)" },
      { label: "Keep it", description: "Preserves the observed UX; costs a render pass" },
    ]);
  }),
);

it.effect("rejects an empty question without touching the thread", () =>
  Effect.gen(function* () {
    const fake = makeRecordingEngine();
    const exit = yield* provideAskUser(
      t3TeamAskUser({ question: "   " }, threadId),
      fake.shape,
      makeRepository([]),
    ).pipe(Effect.exit);

    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      expect(Cause.squash(exit.cause)).toBeInstanceOf(T3TeamMcpToolError);
    }
    expect(fake.commands).toEqual([]);
  }),
);

// ── One pending question per thread ──────────────────────────────────────────

const pendingMessageMode = (requestId: string): ReadonlyArray<ProjectionThreadActivity> => [
  activityRow(1, "user-input.requested", {
    requestId,
    questions: [{ id: requestId, header: "Question", question: "Old question", options: [] }],
    responseMode: "message",
  }),
];

it.effect("refuses to ask while a message-mode question is pending, naming its requestId", () =>
  Effect.gen(function* () {
    const fake = makeRecordingEngine();
    const exit = yield* provideAskUser(
      t3TeamAskUser({ question: "New question" }, threadId),
      fake.shape,
      makeRepository(pendingMessageMode("request-already-pending")),
    ).pipe(Effect.exit);

    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      const error = Cause.squash(exit.cause);
      expect(error).toBeInstanceOf(T3TeamMcpToolError);
      expect((error as T3TeamMcpToolError).message).toContain("request-already-pending");
    }
    expect(fake.commands).toEqual([]);
  }),
);

it.effect("allows a new question when provider-native (sync) questions are pending", () =>
  Effect.gen(function* () {
    // Sync questions are provider-session-bound: flushed when their turn ends.
    // A stale one must not block a new durable question.
    const fake = makeRecordingEngine();
    const result = yield* provideAskUser(
      t3TeamAskUser({ question: "New question" }, threadId),
      fake.shape,
      makeRepository([
        activityRow(1, "user-input.requested", {
          requestId: "request-native",
          questions: [{ id: "q", header: "Question", question: "Native", options: [] }],
        }),
      ]),
    );

    expect(result.delivered).toBe(true);
    expect(readActivities(fake.commands)).toHaveLength(1);
  }),
);

it.effect("allows a new question once the pending one is resolved", () =>
  Effect.gen(function* () {
    const fake = makeRecordingEngine();
    const result = yield* provideAskUser(
      t3TeamAskUser({ question: "New question" }, threadId),
      fake.shape,
      makeRepository([
        ...pendingMessageMode("request-answered"),
        activityRow(2, "user-input.resolved", { requestId: "request-answered", answers: {} }),
      ]),
    );

    expect(result.delivered).toBe(true);
  }),
);

it.effect("allows a new question after a stale respond-failure cleared the pending one", () =>
  Effect.gen(function* () {
    const fake = makeRecordingEngine();
    const result = yield* provideAskUser(
      t3TeamAskUser({ question: "New question" }, threadId),
      fake.shape,
      makeRepository([
        ...pendingMessageMode("request-stale"),
        activityRow(2, "provider.user-input.respond.failed", {
          requestId: "request-stale",
          detail: "stale pending user-input request request-stale",
        }),
      ]),
    );

    expect(result.delivered).toBe(true);
  }),
);

// ── Wiring through the real MCP registration layer ───────────────────────────

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
  const fake = makeRecordingEngine();
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
    Layer.provideMerge(Layer.succeed(ProjectionThreadActivityRepository, makeRepository([]))),
  );

  return Effect.gen(function* () {
    const server = yield* McpServer.McpServer;
    const result = yield* server.callTool({
      name: "t3team_ask_user",
      arguments: { question: "Continue?", options: ["Yes", "No"] },
    });

    expect(result.isError).toBe(false);
    const structured = result.structuredContent as Record<string, unknown>;
    expect(structured).toMatchObject({ delivered: true });
    expect(structured.requestId).toBe(String(structured.questionId));
    const activities = readActivities(fake.commands);
    expect(activities.map((activity) => activity.kind)).toEqual(["user-input.requested"]);
    expect(activities[0]?.payload.responseMode).toBe("message");
  }).pipe(
    Effect.provideService(McpInvocationContext.McpInvocationContext, invocation),
    Effect.provideService(McpSchema.McpServerClient, client),
    Effect.provide(TestLayer),
  );
});
