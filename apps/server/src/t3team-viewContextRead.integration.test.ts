/* oxlint-disable t3code/no-manual-effect-runtime-in-tests -- HTTP route integration bridges Effect for HttpClient assertions. */
// @effect-diagnostics missingEffectContext:off - route server boot is fully provided before runPromise.
/**
 * publish (HTTP route) -> store -> `t3team.view.read` (what `t3_view_read` calls): the agent's
 * answer carries the view the web published, with its age, and says so when nothing was published.
 */
import * as NodeHttpServer from "@effect/platform-node/NodeHttpServer";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { ThreadId, type T3TeamViewContext } from "@t3tools/contracts";
import { replaceFeatureFlagPresetValues } from "@t3tools/project-context/t3teamFeatureFlags";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { HttpBody, HttpClient, HttpRouter } from "effect/http";
import { afterEach, describe, expect, it } from "vite-plus/test";

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

const serve = HttpRouter.serve(t3teamThreadViewContextRouteLayer, {
  disableListenLog: true,
  disableLogger: true,
}).pipe(
  Layer.provideMerge(NodeHttpServer.layerTest),
  Layer.provideMerge(T3TeamThreadToolContextStoreLive),
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

describe("t3_view_read", () => {
  it("is offered on /mcp only while the flag is on (default off)", () => {
    expect(isMcpToolEnabled("t3_view_read")).toBe(false);
    replaceFeatureFlagPresetValues(new Map([["AGENTS_VIEW_CONTEXT", true]]));
    expect(isMcpToolEnabled("t3_view_read")).toBe(true);
  });

  it("returns the published view with its age, and the unpublished answer after a clear", async () => {
    replaceFeatureFlagPresetValues(new Map([["AGENTS_VIEW_CONTEXT", true]]));
    const answers = await run(
      Effect.gen(function* () {
        const before = yield* readViaTool;
        const status = yield* publish({ threadId, viewContext });
        const published = yield* readViaTool;
        yield* publish({ threadId, viewContext: null });
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
    const invalid = await run(publish({ threadId, viewContext: { ...viewContext, surface: "x" } }));
    expect(invalid).toBe(400);

    replaceFeatureFlagPresetValues(new Map([["AGENTS_VIEW_CONTEXT", false]]));
    const off = await run(
      Effect.gen(function* () {
        const status = yield* publish({ threadId, viewContext });
        return { status, answer: yield* readViaTool };
      }),
    );
    expect(off.status).toBe(403);
    expect(off.answer.viewContext).toBeUndefined();
  });
});
