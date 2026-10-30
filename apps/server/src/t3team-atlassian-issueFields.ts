import { AtlassianIntegrationProvider } from "@t3tools/integrations-atlassian";
import { WorkItemFieldUpdateInput } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import { providerForAccount } from "./t3team-atlassian-auth-store.ts";
import { T3TeamAtlassianError, tryAtlassianPromise } from "./t3team-atlassian-http.ts";

const decodeInput = Schema.decodeUnknownEffect(WorkItemFieldUpdateInput);

/**
 * Apply a labels / priority / fix-version draft to Jira. The commit step of an accepted proposal:
 * a missing live connection is an error, never a quiet no-op. The body is decoded here because
 * routes hand over unchecked JSON.
 */
export function updateT3TeamAtlassianIssueFields(raw: unknown) {
  return Effect.gen(function* () {
    const { accountId, issueIdOrKey, ...update } = yield* decodeInput(raw).pipe(
      Effect.mapError(
        () => new T3TeamAtlassianError({ message: "Invalid work item field update." }),
      ),
    );
    const provider = yield* providerForAccount(accountId);
    if (!(provider instanceof AtlassianIntegrationProvider)) {
      return yield* new T3TeamAtlassianError({
        message: "Applying a field draft requires a live Atlassian connection.",
      });
    }
    yield* tryAtlassianPromise(
      () => provider.updateIssueFields(accountId, issueIdOrKey, update),
      "Failed to update the Jira work item fields.",
    );
  });
}
