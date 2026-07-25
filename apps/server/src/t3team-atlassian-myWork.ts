import { AtlassianIntegrationProvider } from "@t3tools/integrations-atlassian";
import type { IntegrationAccountRef } from "@t3tools/integrations-core";
import type { ExternalResourceRef, ResourcePage } from "@t3tools/project-context";
import * as Effect from "effect/Effect";

import { providerForAccount } from "./t3team-atlassian-auth-store.ts";
import {
  hasMirrorRowsForProject,
  readMyWorkIssueRows,
} from "./t3team-atlassian-backlog-cacheQueries.ts";
import { ensureBacklogCacheTables } from "./t3team-atlassian-backlog-cacheTables.ts";
import { kickT3TeamAtlassianMirrorSync } from "./t3team-atlassian-backlog-mirrorSyncService.ts";
import { tryAtlassianPromise } from "./t3team-atlassian-http.ts";
import { toT3TeamPollResult, type T3TeamPollEnvelope } from "./t3team-integration-polling.ts";
import { resolveT3TeamAtlassianViewerAccountId } from "./t3team-atlassian-viewer-identity.ts";

export type T3TeamAtlassianMyWorkInput = {
  readonly account: IntegrationAccountRef;
  readonly externalProjectId: string;
};

export type T3TeamAtlassianMyWorkPollInput = T3TeamAtlassianMyWorkInput & {
  readonly poll: T3TeamPollEnvelope;
};

function dedupeById(items: ReadonlyArray<ExternalResourceRef>): ReadonlyArray<ExternalResourceRef> {
  const byId = new Map<string, ExternalResourceRef>();
  for (const item of items) {
    byId.set(item.id, item);
  }
  return [...byId.values()];
}

/**
 * My Work page: issues assigned to the viewer in this project, plus one level
 * of parents — same shape as the live `listResources` path it supersedes, so
 * the Wave-4 client swap only needs to repoint the fetch call.
 *
 * Always kicks the whole-project mirror background sync (fire-and-forget) so
 * the mirror keeps filling in/staying fresh. When the mirror hasn't been
 * populated yet (first load for this project), falls back to the live
 * `provider.listResources` path for this one response so first paint isn't
 * blank while the backfill runs in the background.
 */
export function loadT3TeamAtlassianMyWorkPage(input: T3TeamAtlassianMyWorkInput) {
  return Effect.gen(function* () {
    const provider = yield* providerForAccount(input.account.id);

    if (provider instanceof AtlassianIntegrationProvider) {
      yield* kickT3TeamAtlassianMirrorSync({
        account: input.account,
        externalProjectId: input.externalProjectId,
      });
    }

    const viewerAccountId = yield* resolveT3TeamAtlassianViewerAccountId(input.account);

    if (viewerAccountId) {
      yield* ensureBacklogCacheTables();
      const identity = {
        provider: input.account.provider,
        accountId: input.account.id,
        externalProjectId: input.externalProjectId,
      };

      const hasMirrorRows = yield* hasMirrorRowsForProject(identity);

      if (hasMirrorRows) {
        // Mirror is populated for this project — always trust its projection,
        // including a legitimate empty result (viewer has zero assigned
        // issues right now). Falling back to live here would mean zero-
        // assigned viewers never get mirror-backed responses.
        const projection = yield* readMyWorkIssueRows({ ...identity, viewerAccountId });
        const items = dedupeById([...projection.assigned, ...projection.parents]);
        return {
          items,
          totalCount: items.length,
        } satisfies ResourcePage;
      }
    }

    // Mirror not populated yet (or viewer accountId unresolved) — fall back to
    // the live paginated path for this response only.
    return yield* tryAtlassianPromise(
      () =>
        provider.listResources({
          account: input.account,
          externalProjectId: input.externalProjectId,
        }),
      "Failed to load My Work issues.",
    );
  });
}

export function loadT3TeamAtlassianMyWork(
  input: T3TeamAtlassianMyWorkInput | T3TeamAtlassianMyWorkPollInput,
) {
  return Effect.gen(function* () {
    const page = yield* loadT3TeamAtlassianMyWorkPage(input);
    if ("poll" in input) {
      return toT3TeamPollResult(page, input.poll);
    }
    return page;
  });
}
