import { NodeHttpServer } from "@effect/platform-node";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import { replaceFeatureFlagPresetValues } from "@t3tools/project-context/t3teamFeatureFlags";
import { EnvironmentId, ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { McpServer } from "effect/ai";
import { HttpBody, HttpClient, HttpRouter } from "effect/http";

import { layerMemory as SqlitePersistenceMemory } from "../../../persistence/Sqlite.ts";
import { atlassianAuths } from "../../../t3team-atlassian-auth-state.ts";
import { T3TeamToolBroker, type T3TeamToolBinding } from "../../../t3team-toolBroker.ts";
import {
  makeBrokerLayer,
  threadId as brokerThreadId,
} from "../../../t3team-toolBrokerTestUtils.ts";
import { T3_MCP_PROTOCOL, T3TeamToolkitRegistrationLive } from "../../McpHttpServer.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
import * as ThreadManagementService from "../../../orchestration-v2/ThreadManagementService.ts";
import { T3TeamAskUserWriter } from "./t3team-askUserWriter.ts";

/**
 * `tools/list` advertises an opt-in tool only to a thread whose binding holds it, so the agent is
 * never offered a call the broker would refuse ("Tool ... is not enabled for this thread").
 */
const PUBLISH_MCP = "t3_change_request_publish";
const PUBLISH_TOOL = "t3team.change_request.publish";

beforeEach(() =>
  replaceFeatureFlagPresetValues(new Map([["AGENTS_CHANGE_REQUEST_PUBLISH", true]])),
);
afterEach(() => replaceFeatureFlagPresetValues(new Map()));

const threadId = ThreadId.make("thread-opt-in-list");
const invocation = (
  withThread: boolean,
  callerThreadId: ThreadId = threadId,
): McpInvocationContext.McpInvocationScope => ({
  environmentId: EnvironmentId.make("environment-opt-in-list"),
  requestNamespace: "provider-session-opt-in-list",
  thread: withThread
    ? {
        threadId: callerThreadId,
        providerSessionId: "provider-session-opt-in-list",
        providerInstanceId: ProviderInstanceId.make("pack-test"),
      }
    : undefined,
  client: undefined,
  capabilities: new Set(["orchestration"]),
  issuedAt: 1,
});

const MCP_HEADERS = { accept: "application/json, text/event-stream" };
const jsonRpc = (id: number, method: string, params: unknown) =>
  HttpBody.text(JSON.stringify({ jsonrpc: "2.0", id, method, params }), "application/json");
const resultOf = (text: string): any => {
  const payload = text.trimStart().startsWith("{")
    ? text
    : (text.split("\n").find((line) => line.startsWith("data:")) ?? "data:{}").slice(5);
  return JSON.parse(payload).result;
};

const listedTools = (input: {
  readonly heldToolIds: ReadonlyArray<string> | undefined;
  readonly withThread?: boolean;
  /** The broker the list handler sees: a fake holding `heldToolIds`, the real layer, or none. */
  readonly broker?: Layer.Layer<T3TeamToolBroker> | "absent";
  readonly callerThreadId?: ThreadId;
}) =>
  Effect.scoped(
    Effect.gen(function* () {
      const binding: T3TeamToolBinding = {
        threadId,
        listServers: () => [
          {
            name: "t3team",
            tools: Object.fromEntries((input.heldToolIds ?? []).map((id) => [id, {}])),
          } as never,
        ],
        readResource: () => Effect.die("unused"),
        callTool: () => Effect.die("unused"),
      };
      const broker = T3TeamToolBroker.of({
        bindSession: () => Effect.succeed(input.heldToolIds === undefined ? undefined : binding),
        bindReadOnly: () => Effect.void.pipe(Effect.as(undefined)),
      });
      const AuthLive = HttpRouter.middleware<{
        provides: McpInvocationContext.McpInvocationContext;
      }>()(
        Effect.succeed((httpEffect) =>
          httpEffect.pipe(
            Effect.provideService(
              McpInvocationContext.McpInvocationContext,
              invocation(input.withThread ?? true, input.callerThreadId),
            ),
          ),
        ),
      ).layer;
      const transport = McpServer.layerHttp({
        name: "opt-in list test",
        version: "1.0.0",
        path: "/mcp",
        protocols: [T3_MCP_PROTOCOL],
      }).pipe(Layer.provide(AuthLive));
      const registrationServices = Layer.mergeAll(
        Layer.mock(ThreadManagementService.ThreadManagementService)({}),
        Layer.mock(T3TeamAskUserWriter)({}),
      );
      const serverLayer = T3TeamToolkitRegistrationLive.pipe(
        Layer.provide(registrationServices),
        Layer.provideMerge(transport),
        Layer.provideMerge(
          input.broker === "absent"
            ? // The registration only needs the broker at call time; the list handler looks it up
              // optionally, which is the path under test.
              (Layer.empty as unknown as Layer.Layer<T3TeamToolBroker>)
            : (input.broker ?? Layer.succeed(T3TeamToolBroker, broker)),
        ),
      );
      yield* HttpRouter.serve(serverLayer, { disableListenLog: true, disableLogger: true }).pipe(
        Layer.build,
      );
      const http = yield* HttpClient.HttpClient;
      const init = yield* http.post("/mcp", {
        headers: MCP_HEADERS,
        body: jsonRpc(1, "initialize", {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "opt-in-list-test", version: "1.0.0" },
        }),
      });
      const session = {
        ...MCP_HEADERS,
        "mcp-session-id": init.headers["mcp-session-id"]!,
        "mcp-protocol-version": "2025-06-18",
      };
      const response = yield* http.post("/mcp", {
        headers: session,
        body: jsonRpc(2, "tools/list", {}),
      });
      return resultOf(yield* response.text).tools.map(
        (tool: { readonly name: string }) => tool.name,
      ) as ReadonlyArray<string>;
    }),
  ).pipe(Effect.provide(NodeHttpServer.layerTest));

it.effect("lists the opt-in tool for a thread whose binding holds it", () =>
  Effect.gen(function* () {
    const names = yield* listedTools({ heldToolIds: [PUBLISH_TOOL] });
    expect(names).toContain(PUBLISH_MCP);
  }),
);

it.effect("drops the opt-in tool for a thread whose binding does not hold it", () =>
  Effect.gen(function* () {
    const names = yield* listedTools({ heldToolIds: ["t3team.thread.search"] });
    expect(names).not.toContain(PUBLISH_MCP);
    expect(names).toContain("t3_show_widget");
  }),
);

it.effect("drops it when the thread has no binding or the credential has no thread", () =>
  Effect.gen(function* () {
    expect(yield* listedTools({ heldToolIds: undefined })).not.toContain(PUBLISH_MCP);
    expect(yield* listedTools({ heldToolIds: [PUBLISH_TOOL], withThread: false })).not.toContain(
      PUBLISH_MCP,
    );
  }),
);

/** The work-item read tools are listed only while the caller's binding holds them (Jira connected). */
const WORK_ITEM_MCP = ["t3_work_item_search", "t3_work_item_get"];
const WORK_ITEM_TOOLS = ["t3team.work_item.search", "t3team.work_item.get"];

it.effect("lists the work-item read tools for a thread whose binding holds them", () =>
  Effect.gen(function* () {
    const names = yield* listedTools({ heldToolIds: WORK_ITEM_TOOLS });
    for (const name of WORK_ITEM_MCP) expect(names).toContain(name);
  }),
);

it.effect("drops the work-item read tools when the binding lacks them or there is no thread", () =>
  Effect.gen(function* () {
    for (const input of [
      { heldToolIds: ["t3team.thread.search"] },
      { heldToolIds: undefined },
      { heldToolIds: WORK_ITEM_TOOLS, withThread: false },
    ]) {
      const names = yield* listedTools(input);
      for (const name of WORK_ITEM_MCP) expect(names).not.toContain(name);
      expect(names).toContain("t3_show_widget");
    }
  }),
);

it.effect("drops the work-item read tools when the list handler cannot reach the broker", () =>
  Effect.gen(function* () {
    const names = yield* listedTools({ heldToolIds: WORK_ITEM_TOOLS, broker: "absent" });
    for (const name of WORK_ITEM_MCP) expect(names).not.toContain(name);
    // Every other tool keeps the existing fail-open behavior.
    expect(names).toContain("t3_show_widget");
    expect(names).toContain(PUBLISH_MCP);
  }),
);

/**
 * The production `/mcp` path: the list handler binds the caller's thread with NO
 * `allowedToolGroups` and the real broker decides from the project's Jira account state alone.
 * (A recipe-launched binding that carries `allowedToolGroups` without `integration.read` is pinned
 * in `t3team-workItemReadAvailability.test.ts`.) Reads are offered by account state, not by the
 * thread's synced tool context: /mcp threads (cloud, headless) carry none.
 */
describe("through the real broker on the production /mcp bind path", () => {
  const jiraSource = {
    provider: "atlassian",
    accountId: "acct-1",
    externalProjectId: "10001",
  } as const;
  const realBroker = makeBrokerLayer(undefined, { projectSource: jiraSource }).pipe(
    Layer.provide(SqlitePersistenceMemory),
  );
  const listed = () =>
    listedTools({
      heldToolIds: undefined,
      broker: realBroker as unknown as Layer.Layer<T3TeamToolBroker>,
      callerThreadId: brokerThreadId,
    });

  afterEach(() => atlassianAuths.clear());

  it.effect("offers the work-item read tools while Jira is connected", () =>
    Effect.gen(function* () {
      atlassianAuths.set("acct-1", {
        kind: "basic",
        siteUrl: "https://example.atlassian.net",
        email: "a@example.com",
        apiToken: "x",
      });
      const names = yield* listed();
      for (const name of WORK_ITEM_MCP) expect(names).toContain(name);
    }),
  );

  it.effect("does not offer them while Jira is not connected", () =>
    Effect.gen(function* () {
      const names = yield* listed();
      for (const name of WORK_ITEM_MCP) expect(names).not.toContain(name);
    }),
  );
});
