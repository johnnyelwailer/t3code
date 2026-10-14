import type { IntegrationAccount } from "@t3tools/integrations-core";
import * as Effect from "effect/Effect";
import { HttpRouter } from "effect/http";

import { readAtlassianAccountStatuses } from "./t3team-atlassian-accountStatus.ts";
import { disconnectAtlassianAccount } from "./t3team-atlassian-auth-disconnect.ts";
import { providerForPersistedAuths } from "./t3team-atlassian-auth-store.ts";
import {
  badRequestJson,
  errorResponse,
  okJson,
  readJsonBody,
  tryAtlassianPromise,
} from "./t3team-atlassian-http.ts";

/** Display names from Jira when it can be asked; a dead session or an outage just leaves them out. */
const listLiveAccounts = Effect.gen(function* () {
  const provider = yield* providerForPersistedAuths();
  if (!provider) return [] as ReadonlyArray<IntegrationAccount>;
  return yield* tryAtlassianPromise(
    () => provider.listAccounts(),
    "Failed to load persisted Atlassian accounts.",
  );
}).pipe(Effect.orElseSucceed((): ReadonlyArray<IntegrationAccount> => []));

export const t3teamAtlassianAccountsRouteLayer = HttpRouter.add(
  "POST",
  "/api/t3team/atlassian/accounts",
  Effect.gen(function* () {
    const live = yield* listLiveAccounts;
    return okJson({ accounts: yield* readAtlassianAccountStatuses(live) });
  }).pipe(Effect.catch(errorResponse)),
);

export const t3teamAtlassianDisconnectRouteLayer = HttpRouter.add(
  "POST",
  "/api/t3team/atlassian/disconnect",
  Effect.gen(function* () {
    const input = yield* readJsonBody<{ readonly accountId?: string }>();
    if (typeof input.accountId !== "string" || input.accountId === "") {
      return badRequestJson("Say which Jira account to disconnect.");
    }
    return okJson({ disconnected: yield* disconnectAtlassianAccount(input.accountId) });
  }).pipe(Effect.catch(errorResponse)),
);
