import { AtlassianIntegrationProvider } from "@t3tools/integrations-atlassian";
import type { IntegrationAccountRef } from "@t3tools/integrations-core";
import * as Effect from "effect/Effect";

import { providerForAccount } from "./t3work-atlassian-auth-store.ts";
import { tryAtlassianPromise } from "./t3work-atlassian-http.ts";

/**
 * `account.id` is the Jira site/cloud id (used to pick the OAuth client), NOT
 * the user's `atlassianAccountId`. My Work needs the latter to filter the
 * mirror by `assignee_account_id`. The viewer's accountId is stable for the
 * life of the OAuth connection, so a plain in-memory Map keyed by
 * `account.id` is enough — no TTL/expiry needed (mirrors the long-lived auth
 * cache style in t3work-atlassian-auth-store.ts). The auth-store write path
 * invalidates it when auths are (re)persisted, since a reconnect can change
 * the viewer.
 */
const viewerAccountIdByAccountId = new Map<string, string>();

/**
 * Drop all cached viewer accountIds. Called from the auth-store whenever
 * Atlassian auths are (re)persisted (basic connect, OAuth connect, test
 * fixture reset), so reconnecting as a different Atlassian user on the same
 * account id can never keep serving the previous person's My Work.
 */
export function invalidateT3workAtlassianViewerAccountIdCache() {
  viewerAccountIdByAccountId.clear();
}

/**
 * Resolve (and cache) the Jira accountId of the viewer authenticated by
 * `account`. Returns `undefined` for non-Atlassian providers (e.g. the mock
 * provider used when no auth is connected yet). Resolution failures
 * (network/auth hiccups) are logged as warnings and mapped to `undefined` so
 * callers can fall back to the live `listResources` path instead of failing
 * the whole request.
 */
export function resolveT3workAtlassianViewerAccountId(account: IntegrationAccountRef) {
  return Effect.gen(function* () {
    const cached = viewerAccountIdByAccountId.get(account.id);
    if (cached) return cached;

    const provider = yield* providerForAccount(account.id);
    if (!(provider instanceof AtlassianIntegrationProvider)) {
      return undefined;
    }

    const viewerAccountId = yield* tryAtlassianPromise(
      () => provider.resolveViewerAccountId({ account }),
      "Failed to resolve the current Atlassian user.",
    ).pipe(
      Effect.catch((error) =>
        Effect.logWarning(
          "t3work: failed to resolve Atlassian viewer accountId; falling back to live My Work path",
          { accountId: account.id, provider: account.provider, error },
        ).pipe(Effect.as(undefined)),
      ),
    );
    if (viewerAccountId) {
      viewerAccountIdByAccountId.set(account.id, viewerAccountId);
    }
    return viewerAccountId;
  });
}
