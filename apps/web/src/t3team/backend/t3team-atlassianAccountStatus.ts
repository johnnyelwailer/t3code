import type { IntegrationAccount } from "@t3tools/integrations-core";

import { BackendApiError, JIRA_SESSION_EXPIRED_CODE } from "./t3team-t3BackendHttp";

/**
 * A stored Jira account with the state of its session. `label` is the user's display name and
 * `accountUrl` the site, as on every `IntegrationAccount`.
 */
export type AtlassianAccountStatus = IntegrationAccount & {
  readonly status: "connected" | "needs-reconnect";
  readonly needsReconnect: boolean;
  /** ISO time of the last sync that matched Jira. */
  readonly lastSyncAt?: string;
  /** A plain-language sentence about why the last sync failed. */
  readonly lastSyncError?: string;
  /** How far the first sync has got while it is still running; absent otherwise. */
  readonly catchUp?: {
    readonly pagesWalked: number;
    readonly lastPageMs?: number;
    /** ISO time of the Jira change mirrored up to; absent until the older history is being walked. */
    readonly reachedAt?: string;
  };
};

export interface AtlassianAccountBackendApi {
  /** The accounts that can be used right now; throws the typed session-expired error when none can. */
  readonly listAccounts: () => Promise<ReadonlyArray<IntegrationAccount>>;
  /** Every stored account, signed-out ones included. */
  readonly listAccountStatuses: () => Promise<ReadonlyArray<AtlassianAccountStatus>>;
  readonly disconnectAccount: (accountId: string) => Promise<void>;
}

/**
 * What callers that load projects need: the accounts whose session works. A list where every
 * stored account is signed out is the dead-session state those callers already handle.
 */
export function usableAccounts(
  accounts: ReadonlyArray<AtlassianAccountStatus>,
): ReadonlyArray<IntegrationAccount> {
  const usable = accounts.filter((account) => account.status === "connected");
  if (usable.length === 0 && accounts.length > 0) {
    throw new BackendApiError(
      "Your Jira session expired. Sign in again.",
      JIRA_SESSION_EXPIRED_CODE,
    );
  }
  return usable;
}
