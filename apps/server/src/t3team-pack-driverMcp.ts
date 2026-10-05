import type { PackMcpAccess } from "@t3team/pack-api";
import type { ThreadId } from "@t3tools/contracts";

import { readMcpProviderSession } from "./mcp/McpProviderSession.ts";

export const readPackMcpSession = (threadId: ThreadId) => {
  const session = readMcpProviderSession(threadId);
  return session
    ? {
        mcp: {
          endpoint: session.endpoint,
          authorizationHeader: session.authorizationHeader,
        },
      }
    : {};
};

/**
 * A per-turn pack input plus the MCP access of the turn's own thread. A session shared by several
 * app threads was opened with the first thread's access; tool calls must act as this turn's thread.
 */
export const withPackMcp = <P extends object>(
  input: P,
  threadId: ThreadId,
): P & { readonly mcp?: PackMcpAccess } => ({ ...input, ...readPackMcpSession(threadId) });
