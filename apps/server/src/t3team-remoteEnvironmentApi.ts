/**
 * The implementation of `RemoteEnvironmentApi` (`t3team-remoteEnvironmentApiTypes.ts`) over
 * another T3 server's own client protocol: WebSocket RPC (`WsRpcGroup`) for commands and the thread
 * stream, HTTP for the project list. Opened per connection from a `CloudSessionConnection`
 * (`cloud/t3team-cloudSessionConnector.ts`); the socket lives in the caller's scope.
 */
import * as NodeSocket from "@effect/platform-node/NodeSocket";
import {
  CommandId,
  ORCHESTRATION_PROTOCOL_HEADER,
  ORCHESTRATION_PROTOCOL_VERSION_TEXT,
  OrchestrationV2ShellSnapshot,
  WsRpcGroup,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type * as Scope from "effect/Scope";
import * as Stream from "effect/Stream";
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http";
import { RpcClient, RpcSerialization } from "effect/rpc";
import { Socket } from "effect/socket";

import type { CloudSessionConnection } from "./cloud/t3team-cloudSessionConnector.ts";
import {
  RemoteEnvironmentError,
  type RemoteEnvironmentApi,
} from "./t3team-remoteEnvironmentApiTypes.ts";

const failed = (message: string) => (cause: unknown) =>
  new RemoteEnvironmentError({ message, cause });

/** Stable per operation, so a retry after a dropped connection is the same command remotely. */
const commandId = (operation: string, key: string) =>
  CommandId.make(`command:remote-environment:${operation}:${encodeURIComponent(key)}`);

export const openRemoteEnvironmentApi = Effect.fn("remoteEnvironment.openApi")(function* (
  connection: CloudSessionConnection,
): Effect.fn.Return<
  RemoteEnvironmentApi,
  RemoteEnvironmentError,
  Scope.Scope | HttpClient.HttpClient
> {
  const http = (yield* HttpClient.HttpClient).pipe(
    HttpClient.mapRequest((request) =>
      request.pipe(
        HttpClientRequest.bearerToken(connection.bearerToken),
        HttpClientRequest.setHeader(
          ORCHESTRATION_PROTOCOL_HEADER,
          ORCHESTRATION_PROTOCOL_VERSION_TEXT,
        ),
      ),
    ),
    HttpClient.filterStatusOk,
  );
  const protocol = yield* Layer.build(
    RpcClient.layerProtocolSocket().pipe(
      Layer.provide(Socket.layerWebSocket(connection.socketUrl)),
      Layer.provide(NodeSocket.layerWebSocketConstructor),
      Layer.provide(RpcSerialization.layerJson),
    ),
  ).pipe(Effect.mapError(failed("Could not open the cloud session's server connection.")));
  const client = yield* RpcClient.make(WsRpcGroup).pipe(Effect.provideContext(protocol));

  return {
    serverConfig: client["server.getConfig"]({}).pipe(
      Effect.map((config) => ({
        cwd: config.cwd,
        providers: config.providers,
        ...(config.projectFromCwd === undefined ? {} : { projectFromCwd: config.projectFromCwd }),
      })),
      Effect.mapError(failed("Could not read the cloud session's server configuration.")),
    ),
    projects: http.get(`${connection.httpBaseUrl}/api/orchestration/shell`).pipe(
      Effect.flatMap(HttpClientResponse.schemaBodyJson(OrchestrationV2ShellSnapshot)),
      Effect.map((shell) => shell.projects),
      Effect.mapError(failed("Could not list the cloud session's projects.")),
    ),
    launchThread: (input) =>
      client["orchestration.launchThread"]({
        ...input,
        commandId: commandId("launch", input.threadId ?? input.title),
      }).pipe(
        Effect.asVoid,
        Effect.mapError(failed("Could not create the child's thread on the cloud session.")),
      ),
    dispatchMessage: (input) =>
      client["orchestration.dispatchCommand"]({
        type: "message.dispatch",
        commandId: commandId("message", input.messageId),
        threadId: input.threadId,
        messageId: input.messageId,
        text: input.text,
        attachments: [],
        modelSelection: input.modelSelection,
        createdBy: "agent",
        creationSource: "mcp",
        dispatchMode: { type: "queue_after_active" },
      }).pipe(
        Effect.asVoid,
        Effect.mapError(failed("Could not send the child's turn to the cloud session.")),
      ),
    interruptRun: (input) =>
      client["orchestration.dispatchCommand"]({
        type: "run.interrupt",
        commandId: commandId("interrupt", input.runId),
        threadId: input.threadId,
        runId: input.runId,
        reason: "The delegating thread interrupted the child.",
      }).pipe(
        Effect.asVoid,
        Effect.mapError(failed("Could not interrupt the child's run on the cloud session.")),
      ),
    projection: (threadId) =>
      client["orchestration.getThreadProjection"]({ threadId }).pipe(
        Effect.mapError(failed("Could not read the child's thread on the cloud session.")),
      ),
    updates: (threadId) =>
      client["orchestration.subscribeThread"]({ threadId }).pipe(
        Stream.as(undefined),
        Stream.mapError(failed("The connection to the cloud session dropped.")),
      ),
  };
});
