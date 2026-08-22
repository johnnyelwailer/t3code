/* oxlint-disable t3code/no-manual-effect-runtime-in-tests -- HTTP route integration bridges Effect for HttpClient assertions. */
// @effect-diagnostics nodeBuiltinImport:off
// @effect-diagnostics missingEffectContext:off - route server boot is fully provided before runPromise.
// @effect-diagnostics unsafeEffectTypeAssertion:off - scoped HTTP test layer is provided before execution.
/**
 * POST /api/t3team/thread/fork — branch-point slicing and middle truncation.
 *
 * The pure planning logic lives in t3team-thread-fork-plan.test.ts; this test
 * covers the route wiring: `upToMessageId` slicing, the provenance note
 * dispatch on truncation, and error handling.
 */
import {
  MessageId,
  ModelSelection,
  OrchestrationCommand,
  OrchestrationThread,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
} from "@t3tools/contracts";
import * as NodeHttpServer from "@effect/platform-node/NodeHttpServer";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "vite-plus/test";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";
import { HttpBody, HttpClient, HttpRouter } from "effect/unstable/http";

import type { OrchestrationEngineShape } from "./orchestration/Services/OrchestrationEngine.ts";
import { OrchestrationEngineService } from "./orchestration/Services/OrchestrationEngine.ts";
import type { ProjectionSnapshotQueryShape } from "./orchestration/Services/ProjectionSnapshotQuery.ts";
import { ProjectionSnapshotQuery } from "./orchestration/Services/ProjectionSnapshotQuery.ts";
import { t3teamThreadForkRouteLayer } from "./t3team-thread-fork-routes.ts";
import { T3TeamThreadToolContextStore } from "./t3team-threadToolContextStore.ts";

const PARENT_THREAD_ID = ThreadId.make("thread-parent");
const PROJECT_ID = ProjectId.make("project-1");
const CREATED_AT = "2026-01-01T00:00:00Z";

const modelSelection: ModelSelection = {
  instanceId: ProviderInstanceId.make("test-provider"),
  model: "test-model",
};

const makeMessage = (id: string, text: string) => ({
  id: MessageId.make(id),
  role: "user" as const,
  text,
  turnId: null,
  streaming: false,
  createdAt: CREATED_AT,
  updatedAt: CREATED_AT,
});

const makeParentThread = (messageTexts: ReadonlyArray<string>): OrchestrationThread =>
  ({
    id: PARENT_THREAD_ID,
    projectId: PROJECT_ID,
    title: "Parent thread",
    modelSelection,
    runtimeMode: "full-access",
    interactionMode: "default",
    branch: null,
    worktreePath: null,
    latestTurn: null,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    deletedAt: null,
    messages: messageTexts.map((text, index) => makeMessage(`m${index + 1}`, text)),
    proposedPlans: [],
    activities: [],
    checkpoints: [],
    session: null,
  }) as unknown as OrchestrationThread;

const makeQueryMock = (parentThread: OrchestrationThread | undefined) => {
  // Partial mock: only the two reads the fork route performs. Precedent:
  // relay/AgentAwarenessRelay.test.ts casts partial query mocks the same way.
  const query = {
    getProjectShellById: () =>
      Effect.succeed(
        Option.some({
          id: PROJECT_ID,
          title: "Project One",
          workspaceRoot: "/workspace/project-1",
          defaultModelSelection: modelSelection,
          scripts: [],
          createdAt: CREATED_AT,
          updatedAt: CREATED_AT,
        }),
      ),
    getThreadDetailById: () =>
      Effect.succeed(parentThread === undefined ? Option.none() : Option.some(parentThread)),
  } as unknown as ProjectionSnapshotQueryShape;
  return Layer.succeed(ProjectionSnapshotQuery, query);
};

const makeOrchestrationMock = (commands: OrchestrationCommand[]) => {
  const orchestration: OrchestrationEngineShape = {
    readEvents: () => Stream.empty,
    dispatch: (command) =>
      Effect.succeed({ sequence: 1 }).pipe(
        Effect.tap(
          Effect.sync(() => {
            commands.push(command);
          }),
        ),
      ),
    streamDomainEvents: Stream.empty,
    latestSequence: Effect.succeed(0),
  };
  return Layer.succeed(OrchestrationEngineService, orchestration);
};

const contextStoreLayer = Layer.succeed(T3TeamThreadToolContextStore, {
  get: () => Effect.succeed(undefined),
  put: () => Effect.succeed(undefined),
});

const runFork = (parentThread: OrchestrationThread | undefined, body: Record<string, unknown>) => {
  const commands: OrchestrationCommand[] = [];
  const routeTestLayer = HttpRouter.serve(t3teamThreadForkRouteLayer, {
    disableListenLog: true,
    disableLogger: true,
  }).pipe(
    Layer.provideMerge(
      Layer.mergeAll(
        NodeHttpServer.layerTest,
        makeQueryMock(parentThread),
        makeOrchestrationMock(commands),
        contextStoreLayer,
      ),
    ),
  );
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const httpClient = yield* HttpClient.HttpClient;
        const response = yield* httpClient.post("/api/t3team/thread/fork", {
          body: yield* HttpBody.json(body),
        });
        const responseBody = (yield* response.json) as {
          readonly ok?: boolean;
          readonly childThreadId?: string;
          readonly error?: string;
        };
        return { status: response.status, body: responseBody, commands };
      }),
    ).pipe(Effect.provide(Layer.mergeAll(routeTestLayer, NodeServices.layer))) as Effect.Effect<
      {
        status: number;
        body: { ok?: boolean; childThreadId?: string; error?: string };
        commands: OrchestrationCommand[];
      },
      never,
      never
    >,
  );
};

const upserts = (commands: OrchestrationCommand[]) =>
  commands.filter((command) => (command as { type?: string }).type === "thread.message.upsert");

describe("POST /api/t3team/thread/fork", () => {
  it("requires a threadId", async () => {
    const result = await runFork(makeParentThread(["hello"]), {});
    expect(result.status).toBe(502);
    expect(result.body.error).toContain("threadId is required");
  });

  it("reports a missing parent thread", async () => {
    const result = await runFork(undefined, { threadId: "thread-parent" });
    expect(result.status).toBe(502);
    expect(result.body.error).toContain("Thread not found");
  });

  it("forks the whole thread when the transcript fits the budget", async () => {
    const result = await runFork(makeParentThread(["a", "b", "c"]), {
      threadId: "thread-parent",
    });
    expect(result.status).toBe(200);
    expect(result.body.ok).toBe(true);
    expect(result.body.childThreadId).toBeTruthy();
    const messages = upserts(result.commands);
    // No truncation note: exactly the parent's messages.
    expect(messages).toHaveLength(3);
    expect(
      messages.every(
        (command) => (command as { message: { role: string } }).message.role === "user",
      ),
    ).toBe(true);
  });

  it("copies up to and including the requested branch-point message", async () => {
    const result = await runFork(makeParentThread(["a", "b", "c", "d", "e"]), {
      threadId: "thread-parent",
      upToMessageId: "m3",
    });
    expect(result.status).toBe(200);
    const messages = upserts(result.commands);
    expect(messages).toHaveLength(3);
    const texts = messages.map(
      (command) => (command as { message: { text: string } }).message.text,
    );
    expect(texts).toEqual(["a", "b", "c"]);
  });

  it("fails when the branch-point message does not exist", async () => {
    const result = await runFork(makeParentThread(["a", "b"]), {
      threadId: "thread-parent",
      upToMessageId: "m99",
    });
    expect(result.status).toBe(502);
    expect(result.body.error).toContain("not found in the thread");
  });

  it("middle-truncates an oversized transcript and dispatches a provenance note", async () => {
    // 10 messages x 40k chars (~10k tokens each) = ~100k tokens against the 30k cap.
    const big = "x".repeat(40_000);
    const result = await runFork(makeParentThread(Array.from({ length: 10 }, () => big)), {
      threadId: "thread-parent",
    });
    expect(result.status).toBe(200);
    const messages = upserts(result.commands);
    const note = messages.find(
      (command) => (command as { message: { role: string } }).message.role === "system",
    );
    expect(note).toBeDefined();
    const noteExt = (
      note as {
        message: {
          t3teamExt?: { forkSource?: { threadId?: string; omittedMessageCount?: number } };
        };
      }
    ).message.t3teamExt?.forkSource;
    expect(noteExt?.threadId).toBe("thread-parent");
    expect(noteExt?.omittedMessageCount).toBeGreaterThan(0);
    // The note sits between the kept head and the kept tail.
    const noteIndex = messages.indexOf(note);
    expect(noteIndex).toBeGreaterThan(0);
    expect(noteIndex).toBeLessThan(messages.length - 1);
    const headTexts = messages
      .slice(0, noteIndex)
      .map((command) => (command as { message: { text: string } }).message.text);
    const tailTexts = messages
      .slice(noteIndex + 1)
      .map((command) => (command as { message: { text: string } }).message.text);
    // Head keeps the first message, tail keeps the last one.
    expect(headTexts[0]).toBe(big);
    expect(tailTexts[tailTexts.length - 1]).toBe(big);
    // Fewer messages than the parent, with a real gap.
    expect(headTexts.length + tailTexts.length).toBeLessThan(10);
    expect(headTexts.length + tailTexts.length + (noteExt?.omittedMessageCount ?? 0)).toBe(10);
  });
});
