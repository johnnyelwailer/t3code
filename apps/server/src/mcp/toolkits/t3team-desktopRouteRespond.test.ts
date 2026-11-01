import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import { expect, it } from "@effect/vitest";
import {
  EnvironmentId,
  NodeId,
  ProviderInstanceId,
  RuntimeRequestId,
  ThreadId,
  TurnItemId,
  DESKTOP_ROUTE_QUESTION_HEADER,
  DESKTOP_ROUTE_SESSION_LABEL,
  desktopRouteQuestionLine,
  encodeDesktopRouteQuestionId,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { McpSchema, McpServer } from "effect/ai";

import * as ScheduledTaskService from "../../scheduledTasks/ScheduledTaskService.ts";
import * as PeerForwarding from "../../peer/PeerForwarding.ts";
import * as PeerLinkRequests from "../../peer/PeerLinkRequests.ts";
import * as PeerLinks from "../../peer/PeerLinks.ts";
import * as ThreadManagement from "../../orchestration-v2/ThreadManagementService.ts";
import * as ThreadSearch from "../../orchestration-v2/ThreadSearch.ts";
import * as McpHttpServer from "../McpHttpServer.ts";
import * as McpInvocationContext from "../McpInvocationContext.ts";
import * as McpToolAccessTestkit from "../McpToolAccess.testkit.ts";

const layerThreadToolkit = McpHttpServer.layerThreadToolkit.pipe(
  Layer.provide(Layer.mock(ThreadSearch.ThreadSearch)({})),
  Layer.provide(Layer.mock(ScheduledTaskService.ScheduledTaskService)({})),
  Layer.provide(Layer.mock(PeerForwarding.PeerForwarding)({})),
  Layer.provide(Layer.mock(PeerLinkRequests.PeerLinkRequests)({})),
  Layer.provide(Layer.mock(PeerLinks.PeerLinks)({})),
);

const threadId = ThreadId.make("route-respond-thread");
const scope: McpInvocationContext.McpInvocationScope = {
  environmentId: EnvironmentId.make("route-respond-environment"),
  requestNamespace: "route-respond-session",
  thread: {
    threadId,
    providerSessionId: "route-respond-session",
    providerInstanceId: ProviderInstanceId.make("codex"),
  },
  client: undefined,
  issuedAt: 0,
  capabilities: new Set(["orchestration"]),
};
const client = McpSchema.McpServerClient.of({
  clientId: 1,
  protocolVersion: "2025-06-18",
  clientCapabilities: {},
  clientInfo: { name: "route-respond", version: "1" },
  initializePayload: {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "route-respond", version: "1" },
  },
  getClient: Effect.die("unused"),
});

const proposal = { target: "evil.example", internal: false };
const questionId = encodeDesktopRouteQuestionId(proposal);
const requestId = RuntimeRequestId.make("route-question");

/** The agent's own MCP client (no read-only restriction) tries to answer the question. */
const respondFromAgent = (id: string, dispatched: string[]) => {
  const shell = McpToolAccessTestkit.liveThreadShell(threadId);
  const projection = McpToolAccessTestkit.idleThreadProjection(shell);
  return Effect.gen(function* () {
    const server = yield* McpServer.McpServer;
    return yield* server
      .callTool({
        name: "t3_pending_request",
        arguments: { action: "respond", requestId, answers: { [id]: DESKTOP_ROUTE_SESSION_LABEL } },
      })
      .pipe(
        Effect.provideService(McpInvocationContext.McpInvocationContext, scope),
        Effect.provideService(McpSchema.McpServerClient, client),
      );
  }).pipe(
    Effect.provide(
      layerThreadToolkit.pipe(
        Layer.provideMerge(McpServer.McpServer.layer),
        Layer.provide(NodeCrypto.layer),
        Layer.provide(
          Layer.mock(ThreadManagement.ThreadManagementService)({
            getThreadShell: () => Effect.succeed(shell),
            getProjectThreadRecords: () =>
              Effect.succeed({
                ...projection,
                runtimeRequests: [
                  {
                    id: requestId,
                    nodeId: NodeId.make("root"),
                    providerTurnId: null,
                    nativeRequestRef: null,
                    kind: "user_input",
                    status: "pending",
                    responseCapability: { type: "message" },
                    createdAt: shell.createdAt,
                    resolvedAt: null,
                  },
                ],
                turnItems: [
                  {
                    id: TurnItemId.make("route-question-item"),
                    threadId,
                    runId: null,
                    nodeId: null,
                    providerThreadId: null,
                    providerTurnId: null,
                    nativeItemRef: null,
                    parentItemId: null,
                    ordinal: 0,
                    status: "pending",
                    title: null,
                    startedAt: shell.createdAt,
                    completedAt: null,
                    updatedAt: shell.updatedAt,
                    type: "user_input_request",
                    requestId,
                    questions: [
                      {
                        id,
                        header: DESKTOP_ROUTE_QUESTION_HEADER,
                        question: desktopRouteQuestionLine(proposal),
                        options: [{ label: DESKTOP_ROUTE_SESSION_LABEL, description: "x" }],
                      },
                    ],
                  },
                ],
              }),
            dispatch: (command) => {
              dispatched.push(command.type);
              return Effect.succeed({ sequence: 1 } as never);
            },
          }),
        ),
      ),
    ),
  );
};

it.effect("an agent cannot answer a desktop-route question through t3_pending_request", () => {
  const dispatched: string[] = [];
  return Effect.gen(function* () {
    const result = yield* respondFromAgent(questionId, dispatched);
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain("capability_denied");
    expect(dispatched).toEqual([]);
  });
});

it.effect("the guard is what blocks it: an ordinary question is still answerable", () => {
  const dispatched: string[] = [];
  return Effect.gen(function* () {
    const result = yield* respondFromAgent("size", dispatched);
    expect(result.isError).toBeFalsy();
    expect(dispatched).toEqual(["runtime-request.respond"]);
  });
});
