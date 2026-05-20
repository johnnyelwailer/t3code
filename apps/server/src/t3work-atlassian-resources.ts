import type { IntegrationAccountRef } from "@t3tools/integrations-core";
import * as Effect from "effect/Effect";

import { providerForAccount } from "./t3work-atlassian-auth-store.ts";
import { tryAtlassianPromise } from "./t3work-atlassian-http.ts";

export type T3workAtlassianResourcesInput = {
  readonly account: IntegrationAccountRef;
  readonly externalProjectId: string;
  readonly limit?: number;
};

export function loadT3workAtlassianResourcesPage(input: T3workAtlassianResourcesInput) {
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
