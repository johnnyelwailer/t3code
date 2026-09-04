/**
 * What a running driver may ask for after `/mcp` rejected the bearer it holds.
 *
 * The driver half of `t3team-mcp-credentialContinuity.ts`. A dead credential
 * should cost a retry, not the toolkit — but "re-issue on request" is an
 * authentication decision, so what a caller must prove is spelled out here and
 * enforced in one registry transaction:
 *
 * 1. it presents the exact bearer this host currently records for the thread;
 * 2. it names the provider instance that bearer was scoped to, and matches;
 * 3. it was stamped with the thread's withdrawal epoch when its session
 *    started, and no withdrawal has happened since.
 *
 * None of the three is guessable, and none is sufficient alone. A stray 401
 * never reaches this code, a driver on one provider instance can never be
 * answered with another's credential, and a thread that was stopped or had
 * agent browser access turned off fails with `Revoked` whatever it presents.
 *
 * There is deliberately no "here is a newer one" answer. A driver whose bearer
 * the host has already replaced cannot prove possession of anything the host
 * still recognises, so it is told to start a new turn rather than handed a
 * credential on the strength of a secret nobody can check any more.
 *
 * @module t3team-mcp-credentialRecovery
 */
import type { ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import type { McpProviderSessionConfig } from "./mcp/McpProviderSession.ts";
import * as McpProviderSession from "./mcp/McpProviderSession.ts";
import * as McpSessionRegistry from "./mcp/McpSessionRegistry.ts";
import { publishThreadMcpCredential } from "./t3team-mcp-credentialPublication.ts";

export type McpCredentialRecovery =
  /**
   * The bearer the caller presented is still the one this host honours for
   * that scope. Nothing was minted; reconnecting with it is the whole fix.
   */
  | { readonly _tag: "StillCurrent"; readonly config: McpProviderSessionConfig }
  /** A fresh credential was minted for a session the host still owns. */
  | { readonly _tag: "Reissued"; readonly config: McpProviderSessionConfig }
  /** The thread's MCP access is gone (stopped, revoked, browser access off). */
  | { readonly _tag: "Revoked" }
  /** The caller presented a bearer this host never issued for that scope. */
  | { readonly _tag: "Unrecognized" }
  /** No registry is mounted, so nothing can be issued. */
  | { readonly _tag: "Unavailable" };

export interface McpCredentialRecoveryRequest {
  readonly threadId: ThreadId;
  /** The provider instance the calling driver was started on. */
  readonly providerInstanceId: ProviderInstanceId;
  readonly presentedAuthorizationHeader: string;
  /** The thread's withdrawal count when this driver was handed its bearer. */
  readonly credentialEpoch: bigint;
}

export const reestablishMcpCredential = (
  input: McpCredentialRecoveryRequest,
  /**
   * The transaction to settle against. Defaulted, and a seam only so a test can
   * run something *between* the commit and the caller resuming — the interval
   * this module's publication used to happen in.
   */
  claim: (
    request: McpSessionRegistry.McpCredentialClaimRequest,
  ) => Effect.Effect<
    McpSessionRegistry.McpCredentialClaim | undefined
  > = McpSessionRegistry.claimActiveMcpCredential,
): Effect.Effect<McpCredentialRecovery> =>
  Effect.suspend(() => {
    const held = McpProviderSession.readMcpProviderSession(input.threadId);
    if (!held) return Effect.succeed({ _tag: "Revoked" } as const);
    // A driver started on one provider instance may never be answered with a
    // credential scoped to another, and the config for that other instance must
    // not even be in reach of a return value. The transaction enforces the same
    // rule on the records; refusing here keeps the two from drifting apart.
    if (held.providerInstanceId !== input.providerInstanceId) {
      return Effect.succeed({ _tag: "Unrecognized" } as const);
    }
    return claim({
      threadId: input.threadId,
      providerInstanceId: input.providerInstanceId,
      heldAuthorizationHeader: held.authorizationHeader,
      authority: {
        _tag: "Bearer",
        presentedAuthorizationHeader: input.presentedAuthorizationHeader,
        withdrawalCount: input.credentialEpoch,
      },
      // Installed by the transaction, not by `settle`. Published afterwards, a
      // re-issue that committed before a stop would write itself back over the
      // stop and over the next prepare.
      publish: publishThreadMcpCredential(input.threadId, held),
    }).pipe(Effect.flatMap((settled) => settle(input, held, settled)));
  });

const settle = (
  input: McpCredentialRecoveryRequest,
  held: McpProviderSessionConfig,
  claim: McpSessionRegistry.McpCredentialClaim | undefined,
): Effect.Effect<McpCredentialRecovery> => {
  if (claim === undefined) return Effect.succeed({ _tag: "Unavailable" } as const);
  switch (claim._tag) {
    case "Reused":
      // Reachable only for a caller that presented `held` itself, so this is
      // "your credential is fine" — a transport-level failure, not a dead
      // bearer. Minting here would orphan a credential that still works.
      return Effect.succeed({ _tag: "StillCurrent", config: held } as const);
    case "Issued":
      // Already published, by the transaction that minted it. What is left here
      // is reporting. A withdrawal that lands after the commit takes the record
      // away and clears the store in its own transaction, so the driver
      // reconnects with a bearer that 401s once and is then told it was
      // revoked — the one thing that cannot happen is the store being left
      // pointing at this credential after that withdrawal.
      return Effect.logInfo("re-established a thread's MCP credential after a rejected bearer", {
        threadId: input.threadId,
        providerInstanceId: input.providerInstanceId,
      }).pipe(Effect.as({ _tag: "Reissued", config: claim.config } as const));
    case "Withdrawn":
      return Effect.succeed({ _tag: "Revoked" } as const);
    case "Unrecognized":
      return Effect.succeed({ _tag: "Unrecognized" } as const);
  }
};

/**
 * Why re-establishment failed, in words an agent can act on. A bare 401 reads
 * to a model as "the platform is down"; these say what is actually true and
 * what would fix it.
 *
 * The advice has to be true in every state that reaches it, which is stricter
 * than it sounds. "Start a new turn" was wrong for two of the three ways a
 * thread reaches `Revoked`: a credential is established when the server
 * *starts* a session, so on a session that is still running, a turn changes
 * nothing. Telling a model to retry something that cannot work is how it ends
 * up reporting an outage instead of the one thing the user could act on.
 */
export const mcpCredentialRecoveryFailureReason = (
  recovery: Extract<McpCredentialRecovery, { _tag: "Revoked" | "Unrecognized" | "Unavailable" }>,
): string => {
  switch (recovery._tag) {
    case "Revoked":
      return "this thread no longer has an MCP session on the server: it was stopped, or agent browser access was turned off in settings. Restarting the thread's session re-opens one — as does a new turn, but only when the server has to start the session again, so do not rely on a turn alone. If agent browser access was turned off, it has to be switched back on first";
    case "Unrecognized":
      // Not "start a new turn" — the falsehood corrected in `Revoked`: a turn
      // routes to the running session and only refreshes the record it holds.
      return "the credential presented was not the one this server issued for this thread, so whatever is asking is no longer the session the server recognises. Restarting the thread's session is what issues a fresh credential; a new turn on the session that is already running will not";
    case "Unavailable":
      // Accurate before, but there was nothing anyone could do with it.
      return "the server's MCP credential registry is not running, so no credential can be issued for any thread. Nothing inside this thread will fix it — tell the user the T3 Code server needs restarting";
  }
};
