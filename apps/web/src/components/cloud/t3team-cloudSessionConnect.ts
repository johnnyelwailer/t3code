import type { CloudSession, EnvironmentId } from "@t3tools/contracts";

/**
 * Resolving which relay environment a READY cloud session belongs to, so the
 * client can connect to it without the user hunting through the environment
 * list.
 *
 * The machineLabel is NOT the key: it is the runner's shape ("ubuntu-slim ·
 * 12 GB · 4 cores") while the relay registers the environment under the
 * machine's *hostname*, so the two never match. The only identities that
 * actually work are, in preference order:
 *   1. the relay environment id carried on the session record, when the
 *      server/fleet supplies it (`session.environmentId`);
 *   2. the environment that appeared in relay discovery *after* this session
 *      was requested — the new machine's link is what just showed up;
 *   3. a single unambiguous relay environment (there is exactly one non-primary
 *      environment to be), or one whose label happens to match the machine.
 *
 * Pure and React-free, so the correlation rule has exactly one home and can be
 * tested without a live relay.
 */

/** A relay environment in the shape the connect flow needs. */
export interface RelayEnvironmentCandidate {
  readonly environmentId: EnvironmentId;
  readonly label: string;
}

/**
 * Everything the correlation knows besides the session: the relay environments
 * the client has discovered, the environment this client itself is, and — when
 * the caller captured it at request time — the set of relay environment ids
 * that already existed, which is what makes "just appeared" detectable.
 */
export interface CloudSessionResolutionContext {
  readonly relayEnvironments: readonly RelayEnvironmentCandidate[];
  readonly primaryEnvironmentId: EnvironmentId | null;
  /** Relay env ids present when the session was requested; null if unknown. */
  readonly environmentIdsBefore: ReadonlySet<string> | null;
}

function normalizeLabel(value: string): string {
  return value.trim().toLowerCase();
}

function isRelayEnvironmentId(value: string): boolean {
  return value.length > 0;
}

/**
 * The relay environment a ready cloud session's machine is registered under,
 * resolved through the rules above. `null` when the session is not ready or no
 * single environment can be attributed to it — the caller then keeps pointing
 * the user at the environment list instead of guessing the wrong machine.
 */
export function resolveCloudSessionEnvironment(
  session: Pick<CloudSession, "phase" | "machineLabel" | "environmentId">,
  context: CloudSessionResolutionContext,
): RelayEnvironmentCandidate | null {
  if (session.phase !== "ready") return null;
  const { relayEnvironments, primaryEnvironmentId, environmentIdsBefore } = context;

  // A primary environment is never "the machine you just started".
  const candidates = relayEnvironments.filter(
    (environment) => environment.environmentId !== primaryEnvironmentId,
  );
  if (candidates.length === 0) return null;

  // 1. The record carries the relay env id: trust it exclusively. If discovery
  //    has not delivered that environment yet, refuse to guess a different
  //    machine rather than connect the wrong one.
  const explicitId = session.environmentId;
  if (explicitId !== undefined && isRelayEnvironmentId(explicitId)) {
    return (
      candidates.find((environment) => String(environment.environmentId) === explicitId) ?? null
    );
  }

  // 2. No id on the record: correlate by "appeared after this session was
  //    requested".
  let pool = candidates;
  if (environmentIdsBefore !== null) {
    const appeared = candidates.filter(
      (environment) => !environmentIdsBefore.has(String(environment.environmentId)),
    );
    // Nothing new means the relay reused an existing link (workspace continuity):
    // fall back to the full candidate set rather than refusing.
    pool = appeared.length > 0 ? appeared : candidates;
  }

  const labelMatched = pool.filter(
    (environment) => normalizeLabel(environment.label) === normalizeLabel(session.machineLabel),
  );
  if (labelMatched.length === 1) return labelMatched[0] ?? null;
  if (pool.length === 1) return pool[0] ?? null;
  return null;
}
