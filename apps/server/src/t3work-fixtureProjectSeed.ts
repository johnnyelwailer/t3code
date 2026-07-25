import { ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import { writeCachedT3workAtlassianBacklog } from "./t3work-atlassian-backlog-cache.ts";
import { ensureT3workContextCacheTables } from "./t3work-context-cache-tables.ts";
import { runT3workContextProjectRefreshForeground } from "./t3work-contextProjectRefreshRun.ts";
import { runT3workContextRefreshForeground } from "./t3work-contextRefreshForegroundRun.ts";
import { fixtureTicketKey } from "./t3work-fixtureProjectSourceLoad.ts";
import { fixtureResourcePage } from "./t3work-fixtureProjectSourceRefs.ts";
import {
  buildT3workFixtureAccountId,
  registerT3workFixtureProject,
} from "./t3work-fixtureProjectRegistry.ts";
import {
  writeT3workFixtureProjectContextMetadata,
  type T3workFixtureSeedResult,
} from "./t3work-fixtureProjectSeedMetadata.ts";

export type { T3workFixtureSeedResult } from "./t3work-fixtureProjectSeedMetadata.ts";

/**
 * Ingest a fixture directory into a workspace through the SAME pipeline the live Atlassian
 * sync uses. Nothing here writes projections directly:
 *   1. the fixture provider is registered for a `fixture:` account id;
 *   2. `metadata.json` binds the workspace project to that account (no credentials);
 *   3. the backlog cache is filled from `provider.listResources` (what the live sync caches);
 *   4. `runT3workContextProjectRefreshForeground` writes `.t3work/context/**`;
 *   5. `runT3workContextRefreshForeground` per work item walks the provider graph and fills
 *      `t3work_context_resources`, `t3work_context_search` and `t3work_context_edges`.
 */
export function seedT3workFixtureProject(input: {
  readonly fixtureRoot: string;
  readonly workspaceRoot: string;
  readonly accountName?: string;
}) {
  return Effect.gen(function* () {
    const accountId = buildT3workFixtureAccountId(input.accountName ?? "demo");
    const provider = registerT3workFixtureProject({ accountId, fixtureRoot: input.fixtureRoot });
    const source = provider.source;
    yield* ensureT3workContextCacheTables();
    yield* writeT3workFixtureProjectContextMetadata({
      workspaceRoot: input.workspaceRoot,
      source,
    });

    const page = fixtureResourcePage(source);
    yield* writeCachedT3workAtlassianBacklog({
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
    const projectRefresh = yield* runT3workContextProjectRefreshForeground({
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
        runT3workContextRefreshForeground({
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
    } satisfies T3workFixtureSeedResult;
  });
}
