import { AtlassianIntegrationProvider } from "@t3tools/integrations-atlassian";
import type { IntegrationAccountRef } from "@t3tools/integrations-core";
import type { ResourcePage } from "@t3tools/project-context";
import * as Effect from "effect/Effect";

import { providerForAccount } from "./t3team-atlassian-auth-store.ts";
import { readCachedBacklogIssueRows } from "./t3team-atlassian-backlog-cacheQueries.ts";
import { parseJson, type BacklogResourceRef } from "./t3team-atlassian-backlog-cacheShared.ts";
import { ensureBacklogCacheTables } from "./t3team-atlassian-backlog-cacheTables.ts";
import { kickT3TeamAtlassianMirrorSync } from "./t3team-atlassian-backlog-mirrorSyncService.ts";
import { tryAtlassianPromise } from "./t3team-atlassian-http.ts";

export type T3TeamAtlassianProjectIssuesInput = {
  readonly account: IntegrationAccountRef;
  readonly externalProjectId: string;
};

function compareByUpdatedAtDesc(a: BacklogResourceRef, b: BacklogResourceRef): number {
  const left = a.updatedAt ?? "";
  const right = b.updatedAt ?? "";
  if (left !== right) return left < right ? 1 : -1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Every issue of one project, straight out of the whole-project SQLite mirror.
 *
 * This is the "what does this project contain" question, and it is deliberately
 * NOT the same question as My Work (`assignee = currentUser()`) or the backlog
 * view (scoped to the selected board/sprint/filter). Views that need to resolve
 * arbitrary relationships — a work item's children, parent, or linked issues —
 * need the unfiltered set, because a child is very often assigned to somebody
 * else and outside the active sprint.
 *
 * Same mirror, same background sync, different projection: `parentId` already
 * lives on every mirrored ref, so standard-type children (which never appear in
 * a Jira issue's `fields.subtasks`) resolve locally with no extra Jira call.
 *
 * Falls back to the live paginated path for one response while the mirror is
 * still empty (first open of a project), so first paint isn't blank.
 */
export function loadT3TeamAtlassianProjectIssuesPage(input: T3TeamAtlassianProjectIssuesInput) {
  return Effect.gen(function* () {
    const provider = yield* providerForAccount(input.account.id);

    if (provider instanceof AtlassianIntegrationProvider) {
      yield* kickT3TeamAtlassianMirrorSync({
        account: input.account,
        externalProjectId: input.externalProjectId,
      });
    }

    yield* ensureBacklogCacheTables();
    const rows = yield* readCachedBacklogIssueRows({
      provider: input.account.provider,
      accountId: input.account.id,
      externalProjectId: input.externalProjectId,
    });

    if (rows.length > 0) {
      const items: BacklogResourceRef[] = [];
      for (const row of rows) {
        const parsed = parseJson<BacklogResourceRef>(row.resourceJson);
        if (parsed) items.push(parsed);
      }
      // Stable order keeps the response — and therefore any fingerprint taken
      // over it — identical between reads that saw the same mirror rows.
      items.sort(compareByUpdatedAtDesc);
      return { items, totalCount: items.length } satisfies ResourcePage;
    }

    return yield* tryAtlassianPromise(
      () =>
        provider.listResources({
          account: input.account,
          externalProjectId: input.externalProjectId,
        }),
      "Failed to load Atlassian project issues.",
    );
  });
}
