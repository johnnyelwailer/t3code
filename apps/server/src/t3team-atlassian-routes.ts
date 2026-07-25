import { AtlassianIntegrationProvider } from "@t3tools/integrations-atlassian";
import { MockIntegrationProvider } from "@t3tools/integrations-core/mock";
import type { IntegrationAccountRef } from "@t3tools/integrations-core";
import * as Effect from "effect/Effect";
import { HttpRouter } from "effect/unstable/http";
import {
  type BasicConnectInput,
  type OAuthConnectInput,
  loadPersistedAuths,
  providerForAccount,
  providerForPersistedAuths,
  replaceAtlassianAuths,
  savePersistedAuths,
} from "./t3team-atlassian-auth-store.ts";
import {
  errorResponse,
  okJson,
  readJsonBody,
  tryAtlassianPromise,
} from "./t3team-atlassian-http.ts";
import { persistAtlassianOAuthAccounts } from "./t3team-atlassian-oauth-accountPersist.ts";
export { t3teamAtlassianAssetContentRouteLayer } from "./t3team-atlassian-asset-content-route.ts";
export { t3teamAtlassianBacklogRouteLayer } from "./t3team-atlassian-backlog-routes.ts";
export { t3teamAtlassianMyWorkRouteLayer } from "./t3team-atlassian-myWork-routes.ts";
export { t3teamAtlassianResourcesRouteLayer } from "./t3team-atlassian-resources-routes.ts";

type ResourceGetInput = {
  readonly accountId: string;
  readonly ref: unknown;
};

type AssetGetInput = {
  readonly accountId: string;
  readonly url: string;
};

const mockProvider = new MockIntegrationProvider();

export const t3teamAtlassianConnectBasicRouteLayer = HttpRouter.add(
  "POST",
  "/api/t3team/atlassian/connect/basic",
  Effect.gen(function* () {
    yield* loadPersistedAuths;
    const input = yield* readJsonBody<BasicConnectInput>();

    if (!input.auth.apiToken.trim()) {
      return okJson({
        accounts: yield* tryAtlassianPromise(
          () => mockProvider.listAccounts(),
          "Failed to load preview Atlassian accounts.",
        ),
      });
    }

    const provider = new AtlassianIntegrationProvider(input.auth);
    const accounts = yield* tryAtlassianPromise(
      () => provider.listAccounts(),
      "Failed to connect to Atlassian.",
    );
    replaceAtlassianAuths(accounts.map((account) => ({ accountId: account.id, auth: input.auth })));
    yield* savePersistedAuths;
    return okJson({ accounts });
  }).pipe(Effect.catch(errorResponse)),
);

export const t3teamAtlassianAccountsRouteLayer = HttpRouter.add(
  "POST",
  "/api/t3team/atlassian/accounts",
  Effect.gen(function* () {
    const provider = yield* providerForPersistedAuths();
    if (!provider) {
      return okJson({ accounts: [] });
    }
    const accounts = yield* tryAtlassianPromise(
      () => provider.listAccounts(),
      "Failed to load persisted Atlassian accounts.",
    );
    return okJson({ accounts });
  }).pipe(Effect.catch(errorResponse)),
);

export const t3teamAtlassianConnectOAuthRouteLayer = HttpRouter.add(
  "POST",
  "/api/t3team/atlassian/connect/oauth",
  Effect.gen(function* () {
    const input = yield* readJsonBody<OAuthConnectInput>();
    // Same persistence path the server-owned flow (`oauth/complete`) uses; see
    // t3team-atlassian-oauth-accountPersist.ts.
    const accounts = yield* persistAtlassianOAuthAccounts({
      sites: input.auth.sites,
      token: input.auth.token,
    });
    return okJson({ accounts });
  }).pipe(Effect.catch(errorResponse)),
);

export const t3teamAtlassianProjectsRouteLayer = HttpRouter.add(
  "POST",
  "/api/t3team/atlassian/projects",
  Effect.gen(function* () {
    const account = yield* readJsonBody<IntegrationAccountRef>();
    const provider = yield* providerForAccount(account.id);
    const projects = yield* tryAtlassianPromise(
      () => provider.listProjects(account),
      "Failed to load Atlassian projects.",
    );
    return okJson({ projects });
  }).pipe(Effect.catch(errorResponse)),
);

export const t3teamAtlassianResourceRouteLayer = HttpRouter.add(
  "POST",
  "/api/t3team/atlassian/resource",
  Effect.gen(function* () {
    const input = yield* readJsonBody<ResourceGetInput>();
    const provider = yield* providerForAccount(input.accountId);
    const snapshot = yield* tryAtlassianPromise(
      () => provider.getResource(input.ref),
      "Failed to load Atlassian issue.",
    );
    return okJson({ snapshot });
  }).pipe(Effect.catch(errorResponse)),
);

export const t3teamAtlassianAssetRouteLayer = HttpRouter.add(
  "POST",
  "/api/t3team/atlassian/asset",
  Effect.gen(function* () {
    const input = yield* readJsonBody<AssetGetInput>();
    const provider = yield* providerForAccount(input.accountId);
    const asset = yield* tryAtlassianPromise(
      () => provider.downloadAsset(input.url),
      "Failed to download Atlassian asset.",
    );
    return okJson({
      asset: {
        base64Contents: Buffer.from(asset.bytes).toString("base64"),
        sizeBytes: asset.bytes.byteLength,
        ...(asset.mimeType ? { mimeType: asset.mimeType } : {}),
      },
    });
  }).pipe(Effect.catch(errorResponse)),
);
