/**
 * Keeps a thread's `/mcp` bearer usable for as long as the agent holding it is.
 *
 * A credential is handed to an agent exactly once, when its session starts: the
 * pack bridge opens its MCP client with that header, and the CLI adapters write
 * it into the child process' config. There is no channel to push a replacement
 * into a running agent. So every later mint for the same thread is not a
 * rotation — it is an orphaning. The old token stops resolving, the agent keeps
 * sending it, and every tool call comes back `invalid_mcp_credential` until the
 * session is restarted. The agent cannot tell that apart from the server being
 * down, and reports it as an outage.
 *
 * This module owns the host half of the fix — what a *prepare* does — and
 * `t3team-mcp-credentialRecovery.ts` owns the driver half. Both funnel into one
 * registry transaction (`reuseOrReissue`), which is the only place the answer
 * to "does this thread get a credential, and which one?" is ever decided.
 *
 * What each transaction settles, and what it deliberately does not, is written
 * where the writing happens: `t3team-mcp-credentialPublication.ts`. That note
 * also records the guarantee this design was originally stated with and which
 * turned out to be false.
 *
 * @module t3team-mcp-credentialContinuity
 */
import type { ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import * as McpProviderSession from "./mcp/McpProviderSession.ts";
import * as McpSessionRegistry from "./mcp/McpSessionRegistry.ts";
import {
  clearThreadMcpCredential,
  publishThreadMcpCredential,
} from "./t3team-mcp-credentialPublication.ts";

/**
 * The credential this thread's agent should be using for `providerInstanceId`.
 *
 * The bearer the host currently records is *offered* to the transaction, not
 * trusted by it: reuse happens only when that exact token is still a live
 * record for this exact scope. Revoking what the thread had, installing the
 * replacement, and publishing it to every reader all happen inside that one
 * transaction — so a stale read costs a mint and nothing else, and the returned
 * config is the one the host records at the instant it is returned.
 */
export const claimThreadMcpCredential = (
  request: McpSessionRegistry.McpCredentialRequest,
): Effect.Effect<McpSessionRegistry.McpIssuedCredential | undefined> =>
  Effect.suspend(() => {
    const held = McpProviderSession.readMcpProviderSession(request.threadId);
    return McpSessionRegistry.claimActiveMcpCredential({
      threadId: request.threadId,
      providerInstanceId: request.providerInstanceId,
      heldAuthorizationHeader: held?.authorizationHeader,
      authority: { _tag: "Host" },
      publish: publishThreadMcpCredential(request.threadId, held),
    }).pipe(
      Effect.map((claim) => {
        if (claim === undefined) return undefined;
        if (claim._tag === "Reused") return held ? { config: held } : undefined;
        if (claim._tag === "Issued") return { config: claim.config };
        return undefined;
      }),
    );
  });

/**
 * Withdraw a thread's MCP access: no holder of this thread's credential — the
 * running driver included — can obtain a working one again until the host
 * prepares a new session.
 *
 * The stored config is cleared twice on purpose. Once up front, so no reader
 * picks up a config whose record is about to go away; and once more inside the
 * registry's withdrawal transaction, because a claim that committed before this
 * call would otherwise publish its own config into the gap between the two and
 * leave the thread looking alive after it was stopped.
 */
export const withdrawThreadMcpSession = (
  threadId: ThreadId,
  revoke: (
    threadId: ThreadId,
    onWithdrawn?: () => void,
  ) => Effect.Effect<void> = McpSessionRegistry.revokeActiveMcpThread,
): Effect.Effect<void> =>
  Effect.suspend(() => {
    clearThreadMcpCredential(threadId);
    return revoke(threadId, () => clearThreadMcpCredential(threadId));
  });

/**
 * Attach the `t3-code` MCP server to a session that is about to start.
 *
 * Withholding a credential here is what disables agent browser access
 * everywhere: every adapter treats a missing session as "no MCP server", and
 * `/mcp` accepts nothing but tokens issued from this path.
 *
 * The deny branch revokes as well as clears. A session restart (runtime mode,
 * cwd, model) re-prepares without stopping, so without the revoke a bearer
 * issued before the toggle flipped would stay valid against `/mcp` for the rest
 * of its liveness window, refreshed by every later turn.
 *
 * The grant branch stores nothing of its own: `claimMcpCredential` published
 * the credential in the same step it was decided, and a second write here would
 * be the very stale-publication this module was reworked to remove.
 */
export const prepareThreadMcpSession = (input: {
  readonly threadId: ThreadId;
  readonly providerInstanceId: ProviderInstanceId;
  readonly browserAccessEnabled: Effect.Effect<boolean>;
  readonly claimMcpCredential: typeof claimThreadMcpCredential;
  readonly revokeMcpCredential: (
    threadId: ThreadId,
    onWithdrawn?: () => void,
  ) => Effect.Effect<void>;
}): Effect.Effect<McpSessionRegistry.McpIssuedCredential | undefined> =>
  Effect.gen(function* () {
    if (!(yield* input.browserAccessEnabled)) {
      yield* withdrawThreadMcpSession(input.threadId, input.revokeMcpCredential);
      return undefined;
    }
    return yield* input.claimMcpCredential({
      threadId: input.threadId,
      providerInstanceId: input.providerInstanceId,
    });
  });
