import type { IntegrationAccountRef } from "@t3tools/integrations-core";
import * as Effect from "effect/Effect";

import { providerForAccount } from "./t3team-atlassian-auth-store.ts";
import { tryAtlassianPromise } from "./t3team-atlassian-http.ts";

export type T3TeamAtlassianResourcesInput = {
  readonly account: IntegrationAccountRef;
  readonly externalProjectId: string;
  readonly limit?: number;
};

export function loadT3TeamAtlassianResourcesPage(input: T3TeamAtlassianResourcesInput) {
  return Effect.gen(function* () {
    const provider = yield* providerForAccount(input.account.id);
    return yield* tryAtlassianPromise(
      () =>
        provider.listResources({
          account: input.account,
          externalProjectId: input.externalProjectId,
          ...(input.limit !== undefined ? { limit: input.limit } : {}),
        }),
      "Failed to load Atlassian issues.",
    );
  });
}
