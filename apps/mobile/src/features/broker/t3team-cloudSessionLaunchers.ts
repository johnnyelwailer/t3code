import type { EnvironmentConnectionSummary } from "@t3tools/client-runtime/state/presentation";
import type { EnvironmentId } from "@t3tools/contracts";

/** A connected machine of the user's that can start cloud sessions for the phone. */
export interface CloudSessionLauncher {
  readonly environmentId: EnvironmentId;
  readonly label: string;
}

/**
 * The environments a phone can start a cloud session through: connected, switched on, and not
 * themselves a cloud session, so a new session belongs to a machine the user keeps rather than to
 * one that ends within hours.
 */
export function cloudSessionLaunchers(
  catalog: {
    readonly entries: ReadonlyMap<EnvironmentId, { readonly target: { readonly _tag: string } }>;
  },
  environments: ReadonlyArray<EnvironmentConnectionSummary>,
): ReadonlyArray<CloudSessionLauncher> {
  return environments
    .filter(
      (environment) =>
        environment.isEnabled &&
        environment.connectionState === "connected" &&
        catalog.entries.get(environment.environmentId)?.target._tag !== "BrokerConnectionTarget",
    )
    .map((environment) => ({
      environmentId: environment.environmentId,
      label: environment.environmentLabel,
    }));
}
