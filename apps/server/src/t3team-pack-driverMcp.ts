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
