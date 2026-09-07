/**
 * What the host records about a thread's current MCP credential, and when.
 *
 * `McpSessionRegistry` owns the credentials themselves. This owns the
 * *projection* of its decisions that the rest of the server reads: the stored
 * session config every adapter and the pack bridge start from, and the
 * withdrawal epoch a driver's recovery hook is stamped with. Nothing here
 * decides anything; it only writes down what a transaction already decided.
 *
 * ## The guarantee this exists to make, and the one it replaced
 *
 * An earlier note claimed that *"a stale read can only cause a mint, never a
 * wrong grant"*. That was false as written, and the correction is worth
 * recording rather than quietly deleting.
 *
 * Validating the exact bearer at transaction time settles who may *hold* a
 * credential. It says nothing about what is written down afterwards. While
 * publication was a step of its own, two claims that committed in one order
 * could publish in the other: a prepare that committed before a stop could
 * install its config after the stop and after the next prepare, leaving this
 * map — and every recovery closure built from it — describing a credential the
 * registry had already destroyed. The bearer was dead by then, so nothing was
 * granted that the withdrawal had not already taken away. What broke is that
 * the host went on telling a running agent to reconnect with a token the
 * registry had thrown away, under an epoch from before the stop.
 *
 * So publication is not a step of its own any more. Every write here runs
 * inside the registry transaction that decided it, and every clear inside the
 * transaction that withdrew it, which makes commit order and publication order
 * the same order.
 *
 * Still *not* guaranteed: a claim can be answered with a credential that a
 * withdrawal kills a moment later. That is a race with the user, not between
 * fibers — the answer was true when it was given, the caller finds out on its
 * next `/mcp` call, and the hook it was handed is already refused by the epoch
 * check.
 *
 * @module t3team-mcp-credentialPublication
 */
import type { ThreadId } from "@t3tools/contracts";

import type { McpProviderSessionConfig } from "./mcp/McpProviderSession.ts";
import * as McpProviderSession from "./mcp/McpProviderSession.ts";
import type * as McpSessionRegistry from "./mcp/McpSessionRegistry.ts";

/**
 * The thread's withdrawal count at the moment its current bearer was handed
 * over — the epoch a driver's recovery authority is pinned to.
 *
 * A driver keeps its credential (and its recovery hook) for the whole life of
 * its session, so "I hold this thread's bearer" has to be qualified by "as of
 * when". Any stop or browser-access-off advances the registry's counter, and a
 * hook stamped with an older epoch is refused for good. A missing entry is the
 * same refusal: nothing was recorded, so nothing is authorised.
 */
const credentialEpochByThread = new Map<ThreadId, bigint>();

export const mcpCredentialEpoch = (threadId: ThreadId): bigint | undefined =>
  credentialEpochByThread.get(threadId);

export const setMcpCredentialEpoch = (threadId: ThreadId, epoch: bigint): void => {
  credentialEpochByThread.set(threadId, epoch);
};

export const clearMcpCredentialEpoch = (threadId: ThreadId): void => {
  credentialEpochByThread.delete(threadId);
};

/**
 * Install a committed claim as this thread's current credential.
 *
 * Handed to `reuseOrReissue` and run inside the transaction that made the
 * decision. Synchronous and total, as the registry requires: two map writes
 * that cannot fail.
 */
export const publishThreadMcpCredential =
  (
    threadId: ThreadId,
    held: McpProviderSessionConfig | undefined,
  ): ((claim: McpSessionRegistry.McpGrantedCredentialClaim) => void) =>
  (claim) => {
    // Reuse is reachable only when `held` hashed to the record the transaction
    // matched, so it is that record's own config; there is no other case.
    const config = claim._tag === "Issued" ? claim.config : held;
    if (!config) return;
    McpProviderSession.setMcpProviderSession(config);
    setMcpCredentialEpoch(threadId, claim.withdrawalCount);
  };

/** The same write undone: what a withdrawal publishes. */
export const clearThreadMcpCredential = (threadId: ThreadId): void => {
  McpProviderSession.clearMcpProviderSession(threadId);
  clearMcpCredentialEpoch(threadId);
};
