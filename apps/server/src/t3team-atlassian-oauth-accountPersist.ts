import {
  AtlassianIntegrationProvider,
  type AtlassianAccessibleResource,
  type JiraApiAuth,
  type TokenExchangeResult,
} from "@t3tools/integrations-atlassian";
import { MockIntegrationProvider } from "@t3tools/integrations-core/mock";
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";

import {
  loadPersistedAuths,
  replaceAtlassianAuths,
  savePersistedAuths,
} from "./t3team-atlassian-auth-store.ts";
import { T3TeamAtlassianError, tryAtlassianPromise } from "./t3team-atlassian-http.ts";

const mockProvider = new MockIntegrationProvider();

export type AtlassianOAuthGrant = {
  readonly sites: ReadonlyArray<AtlassianAccessibleResource>;
  readonly token: TokenExchangeResult;
};

/**
 * The one way an Atlassian OAuth grant becomes a persisted account.
 *
 * Extracted from `POST /connect/oauth` so the server-owned flow (`oauth/complete`) lands accounts
 * through exactly the same steps. A second persistence path would be a second place for the
 * viewer-cache invalidation in `replaceAtlassianAuths` to be forgotten, which is how a reconnect
 * silently keeps serving the previous person's My Work.
 */
export function persistAtlassianOAuthAccounts(grant: AtlassianOAuthGrant) {
  return Effect.gen(function* () {
    yield* loadPersistedAuths;

    if (!grant.token.refreshToken?.trim()) {
      return yield* new T3TeamAtlassianError({
        message:
          "Atlassian OAuth did not return a refresh token. Reconnect Atlassian and approve offline access.",
      });
    }

    const now = yield* Clock.currentTimeMillis;
    const expiresAt = now + grant.token.expiresIn * 1000;
    const auths: ReadonlyArray<JiraApiAuth> = grant.sites.map((site) => ({
      kind: "oauth",
      cloudId: site.id,
      siteUrl: site.url,
      accessToken: grant.token.accessToken,
      refreshToken: grant.token.refreshToken,
      expiresAt,
    }));

    if (auths.length === 0) {
      return yield* tryAtlassianPromise(
        () => mockProvider.listAccounts(),
        "Failed to load preview Atlassian accounts.",
      );
    }

    const provider = AtlassianIntegrationProvider.fromMultipleAuths(auths);
    const accounts = yield* tryAtlassianPromise(
      () => provider.listAccounts(),
      "Failed to connect to Atlassian.",
    );
    replaceAtlassianAuths(
      accounts.flatMap((account) => {
        const auth = auths.find(
          (candidate) => candidate.kind === "oauth" && candidate.cloudId === account.id,
        );
        return auth ? [{ accountId: account.id, auth }] : [];
      }),
    );
    yield* savePersistedAuths;
    return accounts;
  });
}
