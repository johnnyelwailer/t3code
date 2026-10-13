import type { PackMcpAccess } from "@t3team/pack-api";
import type { ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import type { McpProviderSessions } from "@t3tools/provider-core/server/McpProviderSessions";

type McpSessions = McpProviderSessions["Service"];

export const readPackMcpSession = (mcpSessions: McpSessions, threadId: ThreadId) =>
  mcpSessions.read(threadId).pipe(
    Effect.map((session) =>
      session
        ? {
            mcp: {
              endpoint: session.endpoint,
              authorizationHeader: session.authorizationHeader,
            },
          }
        : {},
    ),
  );

/**
 * A per-turn pack input plus the MCP access of the turn's own thread. A session shared by several
 * app threads was opened with the first thread's access; tool calls must act as this turn's thread.
 */
export const withPackMcp = <P extends object>(
  mcpSessions: McpSessions,
  input: P,
  threadId: ThreadId,
): Effect.Effect<P & { readonly mcp?: PackMcpAccess }> =>
  readPackMcpSession(mcpSessions, threadId).pipe(Effect.map((access) => ({ ...input, ...access })));
