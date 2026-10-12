import type { PackMcpAccess } from "@t3team/pack-api";
import type { ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import type { McpProviderSessions } from "@t3tools/provider-core/server/McpProviderSessions";

export type PackMcpSessions = Pick<McpProviderSessions["Service"], "read">;

export const readPackMcpSession = (
  sessions: PackMcpSessions,
  threadId: ThreadId,
): Effect.Effect<{ readonly mcp?: PackMcpAccess }> =>
  sessions.read(threadId).pipe(
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
  sessions: PackMcpSessions,
  input: P,
  threadId: ThreadId,
): Effect.Effect<P & { readonly mcp?: PackMcpAccess }> =>
  readPackMcpSession(sessions, threadId).pipe(Effect.map((mcp) => ({ ...input, ...mcp })));
