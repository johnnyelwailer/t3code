import * as Effect from "effect/Effect";

import { providerForAccount } from "./t3work-atlassian-auth-store.ts";
import { readCachedT3workAtlassianBacklog } from "./t3work-atlassian-backlog-cacheRead.ts";
import { loadT3workAtlassianResourcesPage } from "./t3work-atlassian-resources.ts";
import { buildT3workProjectContextBundle } from "./t3work-context-project-bundle-builder.ts";
import { snapshotToT3workContextTicket } from "./t3work-context-ticket.ts";
import { loadT3workContextProjectRefreshScope } from "./t3work-contextProjectRefreshScope.ts";
import type { T3workContextProjectRefreshInput } from "./t3work-contextRefreshServiceTypes.ts";
import { writeT3workWorkspaceContextFiles } from "./t3work-project-workspace-context-files.ts";

export function runT3workContextProjectRefreshForeground(input: T3workContextProjectRefreshInput) {
  return Effect.gen(function* () {
    const scope = yield* loadT3workContextProjectRefreshScope({
      workspaceRoot: input.workspaceRoot,
      projectId: input.projectId,
      force: input.force,
    });
    if (!scope.stale) {
      return {
        ok: true,
        status: "already_synced" as const,
        projectId: scope.project.id,
        availability: "summary" as const,
        entryPointRelativePath: scope.entryPointRelativePath,
        manifestRelativePath: scope.manifestRelativePath,
        workItemCount: scope.workItemCount,
      };
    }

    const provider = yield* providerForAccount(scope.project.source.accountId!);
    const externalProjectId = scope.project.source.externalProjectId!;
    const cachedBacklog = yield* readCachedT3workAtlassianBacklog({
      provider: scope.project.source.provider,
      accountId: scope.project.source.accountId!,
      externalProjectId,
    });
    const resourceItems =
      cachedBacklog?.response.page.items ??
      (yield* loadT3workAtlassianResourcesPage({
        account: {
          id: scope.project.source.accountId!,
          provider: scope.project.source.provider,
        },
        externalProjectId,
        // Bound this refresh fan-out explicitly: each item triggers a getResource
        // call below. listResources no longer caps assigned issues at 50 (that cap
        // silently broke My Work), so keep the prior bound here on purpose rather
        // than inheriting it. Epic 33 revisits context-graph coverage.
        limit: 50,
      })).items;

    const tickets = yield* Effect.forEach(resourceItems, (item) =>
      Effect.tryPromise(() => provider.getResource(item)).pipe(
        Effect.map((snapshot) =>
          snapshotToT3workContextTicket({
            projectId: scope.project.id,
            snapshot,
          }),
        ),
      ),
    );

    const bundle = buildT3workProjectContextBundle({
      project: scope.project,
      linkedRepositoryUrls: scope.linkedRepositoryUrls,
      tickets,
    });
    yield* writeT3workWorkspaceContextFiles({
      workspaceRoot: input.workspaceRoot,
      files: bundle.files,
    });

    return {
      ok: true,
      status: "synced" as const,
      projectId: scope.project.id,
      availability: "summary" as const,
      entryPointRelativePath: bundle.entryPointRelativePath,
      manifestRelativePath: bundle.manifestRelativePath,
      workItemCount: bundle.workItemCount,
    };
  });
}
