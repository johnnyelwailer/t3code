import { ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import { writeCachedT3TeamAtlassianBacklog } from "./t3team-atlassian-backlog-cache.ts";
import { ensureT3TeamContextCacheTables } from "./t3team-context-cache-tables.ts";
import { runT3TeamContextProjectRefreshForeground } from "./t3team-contextProjectRefreshRun.ts";
import { runT3TeamContextRefreshForeground } from "./t3team-contextRefreshForegroundRun.ts";
import { fixtureTicketKey } from "./t3team-fixtureProjectSourceLoad.ts";
import { fixtureResourcePage } from "./t3team-fixtureProjectSourceRefs.ts";
import {
  buildT3TeamFixtureAccountId,
  registerT3TeamFixtureProject,
} from "./t3team-fixtureProjectRegistry.ts";
import {
  writeT3TeamFixtureProjectContextMetadata,
  type T3TeamFixtureSeedResult,
} from "./t3team-fixtureProjectSeedMetadata.ts";

export type { T3TeamFixtureSeedResult } from "./t3team-fixtureProjectSeedMetadata.ts";

/**
 * Ingest a fixture directory into a workspace through the SAME pipeline the live Atlassian
 * sync uses. Nothing here writes projections directly:
 *   1. the fixture provider is registered for a `fixture:` account id;
 *   2. `metadata.json` binds the workspace project to that account (no credentials);
 *   3. the backlog cache is filled from `provider.listResources` (what the live sync caches);
 *   4. `runT3TeamContextProjectRefreshForeground` writes `.t3team/context/**`;
 *   5. `runT3TeamContextRefreshForeground` per work item walks the provider graph and fills
 *      `t3team_context_resources`, `t3team_context_search` and `t3team_context_edges`.
 */
export function seedT3TeamFixtureProject(input: {
  readonly fixtureRoot: string;
  readonly workspaceRoot: string;
  readonly accountName?: string;
}) {
  return Effect.gen(function* () {
    const accountId = buildT3TeamFixtureAccountId(input.accountName ?? "demo");
    const provider = registerT3TeamFixtureProject({ accountId, fixtureRoot: input.fixtureRoot });
    const source = provider.source;
    yield* ensureT3TeamContextCacheTables();
    yield* writeT3TeamFixtureProjectContextMetadata({
      workspaceRoot: input.workspaceRoot,
      source,
    });

    const page = fixtureResourcePage(source);
    yield* writeCachedT3TeamAtlassianBacklog({
      provider: "atlassian",
      accountId,
      externalProjectId: source.externalProjectId,
      requestSelection: {},
      response: {
        page,
        capabilities: { canCreateSubtasks: false },
        boards: [],
        sprints: [],
        savedFilters: [],
        quickFilters: [],
      },
    });

    const seedThreadId = ThreadId.make(`fixture-seed-${source.project.id}`);
    const projectRefresh = yield* runT3TeamContextProjectRefreshForeground({
      threadId: seedThreadId,
      workspaceRoot: input.workspaceRoot,
      projectId: source.project.id,
      force: true,
    });

    const refreshedKeys: string[] = [];
    const failedKeys: string[] = [];
    for (const ticket of source.tickets) {
      const ticketKey = fixtureTicketKey(ticket);
      const outcome = yield* Effect.match(
        runT3TeamContextRefreshForeground({
          threadId: seedThreadId,
          workspaceRoot: input.workspaceRoot,
          projectId: source.project.id,
          ticketKey,
          force: true,
        }),
        { onFailure: () => false, onSuccess: () => true },
      );
      (outcome ? refreshedKeys : failedKeys).push(ticketKey);
    }

    return {
      accountId,
      fixtureRoot: source.fixtureRoot,
      projectId: source.project.id,
      externalProjectId: source.externalProjectId,
      workItemCount: projectRefresh.workItemCount,
      refreshedKeys,
      failedKeys,
    } satisfies T3TeamFixtureSeedResult;
  });
}
