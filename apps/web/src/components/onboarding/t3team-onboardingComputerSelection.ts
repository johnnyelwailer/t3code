import type { EnvironmentId } from "@t3tools/contracts";

/**
 * Which computers the onboarding "Connect your computers" step ticks on its
 * own, and when it lets the user continue.
 *
 * Pure and React-free so the rules have one home. The principle: the wizard
 * only pre-selects a computer it can actually reach, and an unreachable one
 * never holds the user hostage — they may still tick it explicitly.
 */

interface SelectableComputer {
  readonly environmentId: EnvironmentId;
  readonly connection: { readonly phase: string };
}

/** A saved computer the wizard may tick for the user: only a connected one. */
export function shouldAutoSelectComputer(environment: SelectableComputer): boolean {
  return environment.connection.phase === "connected";
}

/**
 * A discovered (T3 Connect) computer the wizard may tick for the user: only
 * one whose relay reports it online. Offline or failing relays stay unticked.
 */
export function shouldAutoSelectDiscoveredComputer(availability: string): boolean {
  return availability === "online";
}

/**
 * The selected computers setup runs on: the connected ones. An unreachable
 * computer has no agents or projects to read yet, so the agents and import
 * steps skip it; it stays saved and can be set up once it is reachable.
 */
export function setupEnvironmentIds(
  selectedIds: ReadonlySet<EnvironmentId>,
  environments: readonly SelectableComputer[],
): EnvironmentId[] {
  return environments
    .filter(
      (environment) =>
        selectedIds.has(environment.environmentId) && environment.connection.phase === "connected",
    )
    .map((environment) => environment.environmentId);
}

/**
 * Continue needs at least one selected computer that is connected. Selected
 * computers that are still unreachable do not block it.
 */
export function canContinueWithSelection(
  selectedIds: ReadonlySet<EnvironmentId>,
  environments: readonly SelectableComputer[],
): boolean {
  return setupEnvironmentIds(selectedIds, environments).length > 0;
}
