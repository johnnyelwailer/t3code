import type { EnvironmentId } from "@t3tools/contracts";

/**
 * When the cloud session list is worth loading. Every list is a GitHub Actions read, so a plain
 * local thread must not ask: the list loads only for a cloud surface, a thread bound to a session,
 * or work this client already started. Everything here is a fact that does not depend on the list.
 */
export interface CloudSessionListDemand {
  /** The "Run on" menu is open. */
  readonly menuOpen: boolean;
  /** A page that shows the cloud session panel is mounted. */
  readonly panelVisible: boolean;
  /** This composer has a Run-on cloud target, or a first message queued for a session. */
  readonly bound: boolean;
  /** A create is in flight for some composer. */
  readonly creating: boolean;
  /** A draft's first message waits for its cloud session. */
  readonly queuedSendPending: boolean;
  /** This client created a session that the server list may not carry yet. */
  readonly localSession: boolean;
  /**
   * The loaded list still has something in flight (a provisioning session, a connect in progress).
   * Not an input to the first load, only what keeps it loaded after its surface closes.
   */
  readonly lingering: boolean;
}

export function cloudSessionListWanted(demand: CloudSessionListDemand): boolean {
  return (
    demand.menuOpen ||
    demand.panelVisible ||
    demand.bound ||
    demand.creating ||
    demand.queuedSendPending ||
    demand.localSession ||
    demand.lingering
  );
}

/**
 * Whether `environmentId` can be a cloud session's machine, so a thread there needs the list to
 * tell. A cloud machine is provisioned from the primary environment and joins as another one: the
 * primary environment itself never is. Unknown while the primary environment is not resolved.
 */
export function environmentMayBeCloudSessionMachine(
  environmentId: EnvironmentId | null,
  primaryEnvironmentId: EnvironmentId | null,
): boolean {
  return (
    environmentId !== null &&
    primaryEnvironmentId !== null &&
    environmentId !== primaryEnvironmentId
  );
}
