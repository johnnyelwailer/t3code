import * as Effect from "effect/Effect";
import {
  pullRequestHostOf,
  type OrchestrationProjectShell,
  type ProjectId,
  type SourceControlProviderKind,
} from "@t3tools/contracts";

import * as ProjectionSnapshotQuery from "./orchestration/Services/ProjectionSnapshotQuery.ts";
import { PullRequestProviderRegistry } from "./pullRequest/PullRequestProviderRegistry.ts";

/**
 * Upstream's `PullRequestService` is keyed by `projectId`, not by `host`+`repository`: it reads a
 * checkout's own git remote rather than addressing a repository directly. The pr-context route
 * only ever has `host`+`repository` (from a GitHub webhook/notification payload), so this is the
 * seam that turns one back into the other — a reverse lookup over the project shells the
 * workspace already knows about.
 */

/** The provider-native repository identity, matching `repositoryIdentityOf` in PullRequestService. */
function repositoryIdentityOf(project: OrchestrationProjectShell): string | null {
  const identity = project.repositoryIdentity;
  if (!identity) return null;
  if (identity.displayName) return identity.displayName;
  return identity.owner && identity.name ? `${identity.owner}/${identity.name}` : null;
}

/**
 * Finds the project bound to a repository on a host. Two projects can be checkouts of the same
 * repository (worktrees, or the same fork cloned twice) — that is not an error, so the first
 * *usable* match in shell-snapshot order is returned deterministically and every other match is
 * only noted, never surfaced as a failure. "Usable" means the registry has an implementation for
 * the project's provider kind: a project whose kind is `"unknown"` or unimplemented would only
 * fail every read after being picked, so it is skipped in favor of a later, readable match —
 * mirroring `PullRequestService`'s own `listWorkspaceProjects`, which drops such projects into
 * its `unimplemented` bucket rather than the readable list.
 */
export function resolvePullRequestProjectId(input: {
  readonly host: string;
  readonly repository: string;
}): Effect.Effect<
  ProjectId | null,
  never,
  ProjectionSnapshotQuery.ProjectionSnapshotQuery | PullRequestProviderRegistry
> {
  const wantedHost = input.host.trim().toLowerCase();
  const wantedRepository = input.repository.trim().toLowerCase();

  return Effect.all([
    ProjectionSnapshotQuery.ProjectionSnapshotQuery.pipe(
      Effect.flatMap((projections) => projections.getShellSnapshot()),
    ),
    PullRequestProviderRegistry,
  ]).pipe(
    Effect.flatMap(([snapshot, registry]) => {
      const matches = snapshot.projects.filter((project) => {
        const repository = repositoryIdentityOf(project);
        if (!repository || repository.toLowerCase() !== wantedRepository) return false;
        const kind = project.repositoryIdentity?.provider as SourceControlProviderKind | undefined;
        if (kind === undefined || kind === "unknown" || registry.get(kind) === null) return false;
        return pullRequestHostOf(project.repositoryIdentity, kind) === wantedHost;
      });

      const logAmbiguity =
        matches.length > 1
          ? Effect.logDebug(
              `${String(matches.length)} projects are bound to ${wantedHost}/${wantedRepository}; ` +
                `using the first (${matches[0]!.id}).`,
            )
          : Effect.void;

      return logAmbiguity.pipe(Effect.map(() => matches[0]?.id ?? null));
    }),
    // The project list is best-effort context for a pull request page; if it cannot be read,
    // the route falls back to its own "no matching project" handling rather than failing outright.
    Effect.orElseSucceed(() => null),
  );
}
