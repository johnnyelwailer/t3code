/**
 * The connected Jira accounts with their session state, as the Settings card reads them.
 *
 * Built from the stored accounts rather than a live Jira call: a dead session must show up as a
 * state to act on, not as a failed request or a missing row. A live lookup only improves the
 * display name when it is available.
 */
import type { JiraApiAuth } from "@t3tools/integrations-atlassian";
import type { IntegrationAccount } from "@t3tools/integrations-core";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";

import { accountNeedsReconnect } from "./t3team-atlassian-auth-staleToken.ts";
import { atlassianAuths } from "./t3team-atlassian-auth-state.ts";
import type { T3TeamJiraCatchUp } from "./t3team-atlassian-syncCatchUp.ts";
import { readJiraSyncStatusForAccount } from "./t3team-atlassian-syncStatus.ts";

export type T3TeamAtlassianAccountStatus = IntegrationAccount & {
  readonly status: "connected" | "needs-reconnect";
  readonly needsReconnect: boolean;
  /** ISO time of the last sync that matched Jira. */
  readonly lastSyncAt?: string;
  readonly lastSyncError?: string;
  /** How far the first sync has got while it is still running; absent otherwise. */
  readonly catchUp?: {
    readonly pagesWalked: number;
    readonly lastPageMs?: number;
    /** ISO time of the Jira change mirrored up to. */
    readonly reachedAt?: string;
  };
};

function toCatchUpPayload(
  catchUp: T3TeamJiraCatchUp,
): NonNullable<T3TeamAtlassianAccountStatus["catchUp"]> {
  return {
    pagesWalked: catchUp.pagesWalked,
    ...(catchUp.lastPageMs !== undefined ? { lastPageMs: catchUp.lastPageMs } : {}),
    ...(catchUp.reachedAt !== undefined
      ? { reachedAt: DateTime.formatIso(DateTime.makeUnsafe(catchUp.reachedAt)) }
      : {}),
  };
}

function siteHost(siteUrl: string): string {
  try {
    return new URL(siteUrl).host;
  } catch {
    return siteUrl;
  }
}

function storedAccount(accountId: string, auth: JiraApiAuth): IntegrationAccount {
  const siteUrl = auth.siteUrl;
  return {
    id: accountId,
    provider: "atlassian",
    label: siteUrl ? siteHost(siteUrl) : accountId,
    ...(siteUrl ? { accountUrl: siteUrl } : {}),
  };
}

/** Every stored account in memory, newest reload; `live` supplies the display names it resolved. */
export function readAtlassianAccountStatuses(live: ReadonlyArray<IntegrationAccount>) {
  return Effect.forEach([...atlassianAuths], ([accountId, auth]) =>
    Effect.gen(function* () {
      const needsReconnect = accountNeedsReconnect(accountId);
      const sync = yield* readJiraSyncStatusForAccount(accountId);
      const account =
        live.find((entry) => entry.id === accountId) ?? storedAccount(accountId, auth);
      return {
        ...account,
        status: needsReconnect ? "needs-reconnect" : "connected",
        needsReconnect,
        ...(sync.lastSyncAt !== undefined
          ? { lastSyncAt: DateTime.formatIso(DateTime.makeUnsafe(sync.lastSyncAt)) }
          : {}),
        ...(sync.lastError !== undefined ? { lastSyncError: sync.lastError } : {}),
        ...(sync.catchUp !== undefined ? { catchUp: toCatchUpPayload(sync.catchUp) } : {}),
      } satisfies T3TeamAtlassianAccountStatus;
    }),
  );
}
