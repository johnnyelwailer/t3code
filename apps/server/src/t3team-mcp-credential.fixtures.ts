/**
 * One server lifetime, for the MCP credential tests.
 *
 * Building the registry installs it as the process-wide active one — which is
 * what the module-level helpers under test resolve against — and closing the
 * scope removes it, so a scope boundary here is a faithful server restart.
 *
 * @module t3team-mcp-credential.fixtures
 */
import * as NodeServices from "@effect/platform-node/NodeServices";
import { EnvironmentId, type ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { HttpServer } from "effect/unstable/http";

import * as ServerEnvironment from "./environment/ServerEnvironment.ts";
import * as McpProviderSession from "./mcp/McpProviderSession.ts";
import * as McpSessionRegistry from "./mcp/McpSessionRegistry.ts";
import {
  claimThreadMcpCredential,
  prepareThreadMcpSession,
} from "./t3team-mcp-credentialContinuity.ts";
import { mcpCredentialEpoch } from "./t3team-mcp-credentialPublication.ts";
import type { McpCredentialRecoveryRequest } from "./t3team-mcp-credentialRecovery.ts";

export const registryLayer = McpSessionRegistry.layer.pipe(
  Layer.provide(
    Layer.succeed(
      HttpServer.HttpServer,
      HttpServer.HttpServer.of({
        address: { _tag: "TcpAddress", hostname: "127.0.0.1", port: 43123 },
        serve: (() => Effect.void) as HttpServer.HttpServer["Service"]["serve"],
      }),
    ),
  ),
  Layer.provide(
    Layer.succeed(
      ServerEnvironment.ServerEnvironment,
      ServerEnvironment.ServerEnvironment.of({
        getEnvironmentId: Effect.succeed(EnvironmentId.make("environment-1")),
        getDescriptor: Effect.die("unused"),
      }),
    ),
  ),
  Layer.provide(NodeServices.layer),
);

export const serverProcess = <A, E>(
  body: Effect.Effect<A, E, McpSessionRegistry.McpSessionRegistry>,
) => Effect.scoped(Effect.provide(body, registryLayer));

/** The raw token inside a stored `Authorization` header. */
export const bare = (header: string): string => header.replace(/^Bearer\s+/, "");

export const preparedSession = (
  threadId: ThreadId,
  providerInstanceId: ProviderInstanceId,
  browserAccessEnabled = true,
) =>
  prepareThreadMcpSession({
    threadId,
    providerInstanceId,
    browserAccessEnabled: Effect.succeed(browserAccessEnabled),
    claimMcpCredential: claimThreadMcpCredential,
    revokeMcpCredential: McpSessionRegistry.revokeActiveMcpThread,
  });

/**
 * What a driver keeps for the life of its session: the scope it was started
 * for, the bearer it sends, and the withdrawal epoch that was in force —
 * exactly what `readPackMcpSession` bakes into its `reestablish` closure.
 */
export const driverHandle = (
  threadId: ThreadId,
  providerInstanceId: ProviderInstanceId,
): McpCredentialRecoveryRequest => {
  const session = McpProviderSession.readMcpProviderSession(threadId);
  if (!session) throw new Error("no prepared session to build a driver handle from");
  return {
    threadId,
    providerInstanceId,
    presentedAuthorizationHeader: session.authorizationHeader,
    credentialEpoch: mcpCredentialEpoch(threadId) ?? -1n,
  };
};
