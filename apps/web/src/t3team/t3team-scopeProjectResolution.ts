import type { ScopedProjectRef } from "@t3tools/contracts";
import type { ProjectShellProject } from "@t3tools/project-context";

/**
 * Resolves the sidebar's project scope onto the Team project it names.
 *
 * `scopedProjectId` is the scoped GROUP's representative upstream project id and does not have to
 * be an id the Team store knows: a stored project can own the live project's workspace root under
 * a different id. So match against `allProjects` (stored + loose workspaces) — never
 * `store.projects`, which omits loose workspaces — and let `resolveProjectId` remap a live id onto
 * its stored counterpart. Any member of the group may be the one the store knows.
 *
 * Returns `null` for "All projects" or when no member resolves; callers fall back to their
 * unscoped behaviour.
 */
export function resolveScopeTeamProjectId(input: {
  readonly scopedProjectId: string | null;
  readonly scopedProjectRefs: ReadonlyArray<ScopedProjectRef> | null;
  readonly allProjects: ReadonlyArray<ProjectShellProject>;
  readonly resolveProjectId: (projectId: string) => string;
}): string | null {
  if (input.scopedProjectId === null) {
    return null;
  }
  const knownProjectIds = new Set(input.allProjects.map((project) => String(project.id)));
  const candidateIds = [
    input.scopedProjectId,
    ...(input.scopedProjectRefs ?? []).map((ref) => String(ref.projectId)),
  ];
  for (const candidateId of candidateIds) {
    const resolvedId = input.resolveProjectId(candidateId);
    if (knownProjectIds.has(resolvedId)) {
      return resolvedId;
    }
  }
  return null;
}

/**
 * The project a new thread starts in when nothing more specific (an open thread or draft) names
 * one: the first scoped project that can take a thread, else `fallback` (the unscoped default —
 * also used when every scoped project sits on an unreachable machine). `orderedProjects` carries
 * the user's project order, so the "first" member is the one they'd see first.
 */
export function pickScopedDefaultProject<
  T extends { readonly environmentId: string; readonly id: string },
>(input: {
  readonly orderedProjects: ReadonlyArray<T>;
  readonly scopedProjectRefs: ReadonlyArray<ScopedProjectRef> | null;
  readonly offlineEnvironmentIds: ReadonlySet<string>;
  readonly fallback: T | undefined;
}): T | undefined {
  const { scopedProjectRefs } = input;
  if (scopedProjectRefs === null || scopedProjectRefs.length === 0) {
    return input.fallback;
  }
  const inScope = input.orderedProjects.filter((project) =>
    scopedProjectRefs.some(
      (ref) => ref.environmentId === project.environmentId && ref.projectId === project.id,
    ),
  );
  return (
    inScope.find((project) => !input.offlineEnvironmentIds.has(project.environmentId)) ??
    input.fallback
  );
}
