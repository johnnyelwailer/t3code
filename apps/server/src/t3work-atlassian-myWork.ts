import { AtlassianIntegrationProvider } from "@t3tools/integrations-atlassian";
import type { IntegrationAccountRef } from "@t3tools/integrations-core";
import type { ExternalResourceRef, ResourcePage } from "@t3tools/project-context";
import * as Effect from "effect/Effect";

import { providerForAccount } from "./t3work-atlassian-auth-store.ts";
import { readMyWorkIssueRows } from "./t3work-atlassian-backlog-cacheQueries.ts";
import { ensureBacklogCacheTables } from "./t3work-atlassian-backlog-cacheTables.ts";
import { kickT3workAtlassianMirrorSync } from "./t3work-atlassian-backlog-mirrorSyncService.ts";
import { tryAtlassianPromise } from "./t3work-atlassian-http.ts";
import { toT3workPollResult, type T3workPollEnvelope } from "./t3work-integration-polling.ts";
import { resolveT3workAtlassianViewerAccountId } from "./t3work-atlassian-viewer-identity.ts";

export type T3workAtlassianMyWorkInput = {
  readonly account: IntegrationAccountRef;
  readonly externalProjectId: string;
  readonly limit?: number;
};

export type T3workAtlassianMyWorkPollInput = T3workAtlassianMyWorkInput & {
  readonly poll: T3workPollEnvelope;
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
export function loadT3workAtlassianMyWorkPage(input: T3workAtlassianMyWorkInput) {
  return Effect.gen(function* () {
    const provider = yield* providerForAccount(input.account.id);

    if (provider instanceof AtlassianIntegrationProvider) {
      yield* kickT3workAtlassianMirrorSync({
        provider,
        account: input.account,
        externalProjectId: input.externalProjectId,
      });
    }

    const viewerAccountId = yield* resolveT3workAtlassianViewerAccountId(input.account);

    if (viewerAccountId) {
      yield* ensureBacklogCacheTables();
      const projection = yield* readMyWorkIssueRows({
        provider: input.account.provider,
        accountId: input.account.id,
        externalProjectId: input.externalProjectId,
        viewerAccountId,
      });

      if (projection.assigned.length > 0) {
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
          ...(input.limit !== undefined ? { limit: input.limit } : {}),
        }),
      "Failed to load My Work issues.",
    );
  });
}

export function loadT3workAtlassianMyWork(
  input: T3workAtlassianMyWorkInput | T3workAtlassianMyWorkPollInput,
) {
  return Effect.gen(function* () {
    const page = yield* loadT3workAtlassianMyWorkPage(input);
    if ("poll" in input) {
      return toT3workPollResult(page, input.poll);
    }
    return page;
  });
}
