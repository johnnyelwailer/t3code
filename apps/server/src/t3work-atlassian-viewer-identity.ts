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
 * cache style in t3work-atlassian-auth-store.ts).
 */
const viewerAccountIdByAccountId = new Map<string, string>();

/**
 * Resolve (and cache) the Jira accountId of the viewer authenticated by
 * `account`. Returns `undefined` for non-Atlassian providers (e.g. the mock
 * provider used when no auth is connected yet) and swallows resolution
 * failures (network/auth hiccups) so callers can fall back to the live
 * `listResources` path instead of failing the whole request.
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
    ).pipe(Effect.catch(() => Effect.succeed(undefined)));
    if (viewerAccountId) {
      viewerAccountIdByAccountId.set(account.id, viewerAccountId);
    }
    return viewerAccountId;
  });
}
