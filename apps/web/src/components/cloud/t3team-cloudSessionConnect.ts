import type { CloudSession, EnvironmentId } from "@t3tools/contracts";

/**
 * Resolving which catalog environment a READY cloud session belongs to.
 *
 * The contract's `CloudSession` deliberately carries no `environmentId` —
 * the relay link's environment id is minted server-side and only the
 * environment catalog knows it. The one identity the two sides share is the
 * machine label: the fleet's `machineLabel` is the label the session's relay
 * environment registers under, and the dedupe in the Run-on menu already keys
 * on (machine kind, normalized label).
 */

/** A catalog row in the shape the connect flow needs. */
export interface ConnectableEnvironment {
  readonly environmentId: EnvironmentId;
  readonly label: string;
}

function normalizeLabel(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * The catalog environment a ready cloud session's machine is registered
 * under, matched on the machine label. Case- and whitespace-insensitive, in
 * the same spirit as the Run-on dedupe fingerprint. `null` when the catalog
 * does not carry that machine yet (relay discovery lag) — the caller then
 * keeps pointing the user at the environment list instead of guessing.
 */
export function findCloudSessionEnvironment(
  environments: readonly ConnectableEnvironment[],
  session: Pick<CloudSession, "machineLabel" | "phase">,
): ConnectableEnvironment | null {
  if (session.phase !== "ready") return null;
  const target = normalizeLabel(session.machineLabel);
  if (target.length === 0) return null;
  return environments.find((environment) => normalizeLabel(environment.label) === target) ?? null;
}
