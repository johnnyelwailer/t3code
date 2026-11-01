/* oxlint-disable t3code/no-manual-effect-runtime-in-tests -- HTTP route integration bridges Effect for HttpClient assertions. */
// @effect-diagnostics missingEffectContext:off - route server boot is fully provided before runPromise.
/**
 * publish (HTTP route) -> store -> `t3team.view.read` (what `t3_current_view` calls): the agent's
 * answer carries the view the web published, with its age, and says so when nothing was published.
 */
import * as NodeHttpServer from "@effect/platform-node/NodeHttpServer";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { ProjectId, ThreadId, type T3TeamViewContext } from "@t3tools/contracts";
import { replaceFeatureFlagPresetValues } from "@t3tools/project-context/t3teamFeatureFlags";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { HttpBody, HttpClient, HttpRouter } from "effect/http";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { ProjectStoreV2 } from "./orchestration-v2/ProjectStore.ts";
import { ThreadManagementService } from "./orchestration-v2/ThreadManagementService.ts";
import { isMcpToolEnabled } from "./mcp/toolkits/t3team/t3team-mcpToolFeatureGate.ts";
import { t3teamThreadViewContextRouteLayer } from "./t3team-thread-view-context-routes.ts";
import {
  T3TeamThreadToolContextStore,
  T3TeamThreadToolContextStoreLive,
} from "./t3team-threadToolContextStore.ts";
import { T3TEAM_MCP_SERVER_NAME } from "./t3team-toolBroker.ts";
import { createT3TeamThreadToolBinding } from "./t3team-toolBrokerBinding.ts";
import {
  NO_VIEW_CONTEXT_MESSAGE,
  withPublishedViewContext,
} from "./t3team-toolBrokerViewContext.ts";

const threadId = ThreadId.make("thread-view-context");
const toolContext = {
  surface: "t3team",
  tools: [{ id: "t3team.view.read", capabilities: ["read"] }],
  state: null,
} as never;

const viewContext: T3TeamViewContext = {
  version: 1,
  surface: "my-work",
  projectId: "project-1",
  selection: { kind: "work-item", id: "ACME-2" },
  filters: { query: "login", statusCategory: "all", lens: "digest" },
  visibleItemIds: ["ACME-1", "ACME-2"],
  visibleItemCount: 2,
};

const otherThreadId = ThreadId.make("thread-elsewhere");
const projectId = ProjectId.make("project-1");

const resolvedThreads = Layer.mergeAll(
  Layer.mock(ThreadManagementService)({
    getThreadRecords: ((id: ThreadId) =>
      id === threadId || id === otherThreadId
        ? Effect.succeed({ thread: { id, projectId, deletedAt: null } })
        : Effect.fail(`unknown thread ${id}`)) as never,
  }),
  Layer.mock(ProjectStoreV2)({
    getShell: (id) =>
      Effect.succeed(id === projectId ? Option.some({ id } as never) : Option.none()),
  }),
);

const serve = HttpRouter.serve(t3teamThreadViewContextRouteLayer, {
  disableListenLog: true,
  disableLogger: true,
}).pipe(
  Layer.provideMerge(NodeHttpServer.layerTest),
  Layer.provideMerge(T3TeamThreadToolContextStoreLive),
  Layer.provide(resolvedThreads),
);

const run = <A, E>(
  effect: Effect.Effect<A, E, HttpClient.HttpClient | T3TeamThreadToolContextStore>,
) =>
  Effect.runPromise(
    Effect.scoped(effect).pipe(Effect.provide(Layer.mergeAll(serve, NodeServices.layer))),
  );

const publish = (body: unknown) =>
  Effect.gen(function* () {
    const http = yield* HttpClient.HttpClient;
    const response = yield* http.post("/api/t3team/thread/view-context", {
      body: HttpBody.jsonUnsafe(body),
    });
    return response.status;
  });

const publishBody = (sequence: number, overrides: Record<string, unknown> = {}) => ({
  threadId,
  sequence,
  viewContext,
  ...overrides,
});

const storedFor = (id: ThreadId) =>
  Effect.gen(function* () {
    return (yield* (yield* T3TeamThreadToolContextStore).getViewContext(id))?.viewContext;
  });

const readViaTool = Effect.gen(function* () {
  const store = yield* T3TeamThreadToolContextStore;
  const binding = createT3TeamThreadToolBinding({
    threadId,
    toolContext,
    availableToolIds: ["t3team.view.read"],
    readView: () =>
      withPublishedViewContext(() => Effect.succeed({ surface: "t3team" }), store)(threadId),
  });
  const result = yield* binding.callTool({
    server: T3TEAM_MCP_SERVER_NAME,
    tool: "t3team.view.read",
    arguments: {},
  });
  return result.structuredContent as { viewContext?: Record<string, unknown> };
});

afterEach(() => replaceFeatureFlagPresetValues(new Map()));

describe("t3_current_view", () => {
  it("is offered on /mcp only while the flag is on (default off)", () => {
    expect(isMcpToolEnabled("t3_current_view")).toBe(false);
    replaceFeatureFlagPresetValues(new Map([["AGENTS_VIEW_CONTEXT", true]]));
    expect(isMcpToolEnabled("t3_current_view")).toBe(true);
  });

  it("returns the published view with its age, and the unpublished answer after a clear", async () => {
    replaceFeatureFlagPresetValues(new Map([["AGENTS_VIEW_CONTEXT", true]]));
    const answers = await run(
      Effect.gen(function* () {
        const before = yield* readViaTool;
        const status = yield* publish(publishBody(1));
        const published = yield* readViaTool;
        yield* publish(publishBody(2, { viewContext: null }));
        const cleared = yield* readViaTool;
        return { before, status, published, cleared };
      }),
    );
    expect(answers.before.viewContext).toEqual({
      published: false,
      message: NO_VIEW_CONTEXT_MESSAGE,
    });
    expect(answers.status).toBe(200);
    expect(answers.published.viewContext).toMatchObject({
      published: true,
      surface: "my-work",
      projectId: "project-1",
      selection: { kind: "work-item", id: "ACME-2" },
      filters: { query: "login", statusCategory: "all", lens: "digest" },
      visibleItemIds: ["ACME-1", "ACME-2"],
      ageSeconds: 0,
    });
    expect(typeof answers.published.viewContext?.publishedAt).toBe("string");
    expect(answers.cleared.viewContext?.published).toBe(false);
  });

  it("rejects a malformed publication and, with the flag off, neither stores nor answers", async () => {
    replaceFeatureFlagPresetValues(new Map([["AGENTS_VIEW_CONTEXT", true]]));
    const invalid = await run(
      publish(publishBody(1, { viewContext: { ...viewContext, surface: "x" } })),
    );
    expect(invalid).toBe(400);

    replaceFeatureFlagPresetValues(new Map([["AGENTS_VIEW_CONTEXT", false]]));
    const off = await run(
      Effect.gen(function* () {
        const status = yield* publish(publishBody(1));
        return { status, answer: yield* readViaTool };
      }),
    );
    expect(off.status).toBe(403);
    expect(off.answer.viewContext).toBeUndefined();
  });

  it("rejects an unknown thread and a context for another project, and stores nothing", async () => {
    replaceFeatureFlagPresetValues(new Map([["AGENTS_VIEW_CONTEXT", true]]));
    const outcome = await run(
      Effect.gen(function* () {
        const unknown = yield* publish(publishBody(1, { threadId: ThreadId.make("thread-nope") }));
        const crossProject = yield* publish(
          publishBody(1, { viewContext: { ...viewContext, projectId: "project-2" } }),
        );
        return {
          unknown,
          crossProject,
          unknownStored: yield* storedFor(ThreadId.make("thread-nope")),
          crossStored: yield* storedFor(threadId),
        };
      }),
    );
    expect(outcome).toEqual({
      unknown: 404,
      crossProject: 400,
      unknownStored: undefined,
      crossStored: undefined,
    });
  });

  it("lands a publication only on its own thread", async () => {
    replaceFeatureFlagPresetValues(new Map([["AGENTS_VIEW_CONTEXT", true]]));
    const stored = await run(
      Effect.gen(function* () {
        yield* publish(publishBody(1));
        return { own: yield* storedFor(threadId), other: yield* storedFor(otherThreadId) };
      }),
    );
    expect(stored.own?.projectId).toBe("project-1");
    expect(stored.other).toBeUndefined();
  });

  it("ignores a late publication after a clear, and any write after the thread was deleted", async () => {
    replaceFeatureFlagPresetValues(new Map([["AGENTS_VIEW_CONTEXT", true]]));
    const outcome = await run(
      Effect.gen(function* () {
        const store = yield* T3TeamThreadToolContextStore;
        yield* publish(publishBody(5));
        yield* publish(publishBody(6, { viewContext: null }));
        const late = yield* publish(publishBody(5));
        const afterLate = yield* storedFor(threadId);
        yield* store.evictViewContext({ threadId, deleted: true });
        const afterDelete = yield* publish(publishBody(7));
        return { late, afterLate, afterDelete, stored: yield* storedFor(threadId) };
      }),
    );
    expect(outcome).toEqual({
      late: 200,
      afterLate: undefined,
      afterDelete: 404,
      stored: undefined,
    });
  });
});
