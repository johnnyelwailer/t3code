import type { ThreadId } from "@t3tools/contracts";
import type { PackMcpReestablishResult } from "@t3team/pack-api";
import * as Effect from "effect/Effect";

import type { McpProviderSessionConfig } from "./mcp/McpProviderSession.ts";
import { readMcpProviderSession } from "./mcp/McpProviderSession.ts";
import { mcpCredentialEpoch } from "./t3team-mcp-credentialPublication.ts";
import {
  mcpCredentialRecoveryFailureReason,
  reestablishMcpCredential,
} from "./t3team-mcp-credentialRecovery.ts";

/**
 * Re-establish this thread's MCP credential and report the outcome to the pack
 * driver, which reconnects with it.
 *
 * The closure is a capability, so it captures the whole scope it was granted
 * for — thread, provider instance, the exact bearer the driver sends, and the
 * withdrawal epoch that was in force. It cannot be replayed into a different
 * scope: switching the thread to another provider instance, or stopping it,
 * makes every closure minted before that point permanently unanswerable. See
 * `t3team-mcp-credentialRecovery.ts` for what each part authorises.
 */
const makeReestablish =
  (session: McpProviderSessionConfig, credentialEpoch: bigint) =>
  (): Promise<PackMcpReestablishResult> =>
    Effect.runPromise(
      reestablishMcpCredential({
        threadId: session.threadId,
        providerInstanceId: session.providerInstanceId,
        presentedAuthorizationHeader: session.authorizationHeader,
        credentialEpoch,
      }).pipe(
        Effect.map((recovery): PackMcpReestablishResult =>
          recovery._tag === "StillCurrent" || recovery._tag === "Reissued"
            ? {
                ok: true,
                endpoint: recovery.config.endpoint,
                authorizationHeader: recovery.config.authorizationHeader,
              }
            : { ok: false, reason: mcpCredentialRecoveryFailureReason(recovery) },
        ),
      ),
    ).catch((cause: unknown) => ({
      ok: false as const,
      reason: `the server failed while re-establishing the credential: ${
        cause instanceof Error ? cause.message : String(cause)
      }`,
    }));

export const readPackMcpSession = (threadId: ThreadId) => {
  const session = readMcpProviderSession(threadId);
  if (!session) return {};
  const epoch = mcpCredentialEpoch(threadId);
  return {
    mcp: {
      endpoint: session.endpoint,
      authorizationHeader: session.authorizationHeader,
      // No epoch means the host has no record of handing this thread a
      // credential, so there is no authority to hand a recovery hook either.
      ...(epoch === undefined ? {} : { reestablish: makeReestablish(session, epoch) }),
    },
  };
};
