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
  DESKTOP_ROUTE_QUESTION_PREFIX,
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
const respondFromAgent = (
  ids: ReadonlyArray<string>,
  dispatched: string[],
  /** A second `user_input_request` item for the same request, as a re-emitted question would be. */
  laterItemIds: ReadonlyArray<string> = [],
) => {
  const shell = McpToolAccessTestkit.liveThreadShell(threadId);
  const projection = McpToolAccessTestkit.idleThreadProjection(shell);
  const groups = laterItemIds.length > 0 ? [ids, laterItemIds] : [ids];
  return Effect.gen(function* () {
    const server = yield* McpServer.McpServer;
    return yield* server
      .callTool({
        name: "t3_pending_request",
        arguments: {
          action: "respond",
          requestId,
          answers: Object.fromEntries(
            [...ids, ...laterItemIds].map((id) => [id, DESKTOP_ROUTE_SESSION_LABEL]),
          ),
        },
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
                turnItems: groups.map((group, index) => ({
                  id: TurnItemId.make(`route-question-item-${index}`),
                  threadId,
                  runId: null,
                  nodeId: null,
                  providerThreadId: null,
                  providerTurnId: null,
                  nativeItemRef: null,
                  parentItemId: null,
                  ordinal: index,
                  status: "pending",
                  title: null,
                  startedAt: shell.createdAt,
                  completedAt: null,
                  updatedAt: shell.updatedAt,
                  type: "user_input_request",
                  requestId,
                  questions: group.map((id) => ({
                    id,
                    header: DESKTOP_ROUTE_QUESTION_HEADER,
                    question: desktopRouteQuestionLine(proposal),
                    options: [{ label: DESKTOP_ROUTE_SESSION_LABEL, description: "x" }],
                  })),
                })),
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

const asBase64Url = (text: string) => Buffer.from(text).toString("base64url");
const refused = (ids: ReadonlyArray<string>) => {
  const dispatched: string[] = [];
  return Effect.gen(function* () {
    const result = yield* respondFromAgent(ids, dispatched);
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain("capability_denied");
    expect(dispatched).toEqual([]);
  });
};

const refusedWithLaterItem = (ids: ReadonlyArray<string>, later: ReadonlyArray<string>) => {
  const dispatched: string[] = [];
  return Effect.gen(function* () {
    const result = yield* respondFromAgent(ids, dispatched, later);
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain("capability_denied");
    expect(dispatched).toEqual([]);
  });
};

it.effect("an agent cannot answer a desktop-route question through t3_pending_request", () =>
  refused([questionId]),
);

it.effect("a non-ASCII id, which another version would still decode, is refused", () =>
  refused([
    `${DESKTOP_ROUTE_QUESTION_PREFIX}${asBase64Url(JSON.stringify({ target: "ｅｘａｍｐｌｅ.com", internal: true }))}`,
  ]),
);

it.effect("a malformed id in the namespace is refused", () =>
  refused([`${DESKTOP_ROUTE_QUESTION_PREFIX}!!not-base64!!`, `${DESKTOP_ROUTE_QUESTION_PREFIX}`]),
);

it.effect("the prefix is matched case-insensitively", () =>
  refused([
    questionId.replace(DESKTOP_ROUTE_QUESTION_PREFIX, DESKTOP_ROUTE_QUESTION_PREFIX.toUpperCase()),
  ]),
);

it.effect("a request that mixes a desktop-route question with an ordinary one is refused", () =>
  refused(["size", questionId]),
);

it.effect("a desktop-route question in a later item for the same request is refused too", () =>
  refusedWithLaterItem(["size"], [questionId]),
);

it.effect("an ordinary question is still answerable", () => {
  const dispatched: string[] = [];
  return Effect.gen(function* () {
    const result = yield* respondFromAgent(["size"], dispatched);
    expect(result.isError).toBeFalsy();
    expect(dispatched).toEqual(["runtime-request.respond"]);
  });
});
