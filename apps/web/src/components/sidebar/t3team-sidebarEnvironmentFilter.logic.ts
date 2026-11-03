import {
  resolveEnvironmentFilter,
  type EnvironmentFilter,
  type EnvironmentFilterEnvironment,
} from "@t3tools/client-runtime/t3team-environmentFilter";

import { primaryEnvironmentLabel } from "~/connection/t3team-localEnvironmentLabel";

interface GroupWithMembers {
  readonly memberProjectRefs: ReadonlyArray<{ readonly environmentId: string }>;
}

/**
 * The environments the sidebar lists something for: a thread that is not archived, or a project
 * the project pills offer. A connected environment with neither gives the filter nothing to show.
 * The catalog covers every source: this computer, saved and relay environments, and cloud sessions.
 */
export function sidebarEnvironmentFilterCandidates(input: {
  readonly identities: ReadonlyArray<{ readonly environmentId: string; readonly label: string }>;
  readonly primaryEnvironmentId: string | null;
  readonly threads: ReadonlyArray<{
    readonly environmentId: string;
    readonly archivedAt: string | null;
  }>;
  readonly pickableGroups: ReadonlyArray<GroupWithMembers>;
}): ReadonlyArray<EnvironmentFilterEnvironment> {
  const listed = new Set<string>();
  for (const thread of input.threads) {
    if (thread.archivedAt === null) listed.add(thread.environmentId);
  }
  for (const group of input.pickableGroups) {
    for (const ref of group.memberProjectRefs) listed.add(ref.environmentId);
  }
  return input.identities
    .filter((identity) => listed.has(identity.environmentId))
    .map((identity) => {
      const isPrimary = identity.environmentId === input.primaryEnvironmentId;
      return {
        id: identity.environmentId,
        label: isPrimary ? primaryEnvironmentLabel(identity.label) : identity.label,
        isPrimary,
      };
    });
}

export function sidebarEnvironmentFilter(
  candidates: ReadonlyArray<EnvironmentFilterEnvironment>,
  storedEnvironmentId: string | null,
): EnvironmentFilter {
  return resolveEnvironmentFilter({ environments: candidates, selectedId: storedEnvironmentId });
}

/**
 * The scope's `environmentId:projectId` keys limited to one environment. With no project scope
 * (`null`) the scope becomes every project of that environment, so the settled shelf, drafts and
 * route reveal all follow the one set.
 */
export function narrowScopeKeysToEnvironment(
  scopeKeys: ReadonlySet<string> | null,
  environmentId: string | null,
  projects: ReadonlyArray<{ readonly environmentId: string; readonly id: string }>,
): ReadonlySet<string> | null {
  if (environmentId === null) return scopeKeys;
  const prefix = `${environmentId}:`;
  const keys =
    scopeKeys ?? new Set(projects.map((project) => `${project.environmentId}:${project.id}`));
  return new Set([...keys].filter((key) => key.startsWith(prefix)));
}

/** The groups with a project in the environment; every group when none is selected. */
export function narrowGroupsToEnvironment<TGroup extends GroupWithMembers>(
  groups: ReadonlyArray<TGroup>,
  environmentId: string | null,
): ReadonlyArray<TGroup> {
  if (environmentId === null) return groups;
  return groups.filter((group) =>
    group.memberProjectRefs.some((ref) => ref.environmentId === environmentId),
  );
}

/** The project scope keys whose group still has a project in the environment. */
export function projectScopeKeysInEnvironment(
  groups: ReadonlyArray<GroupWithMembers & { readonly projectKey: string }>,
  scopeKeys: readonly string[],
  environmentId: string | null,
): readonly string[] {
  if (environmentId === null) return scopeKeys;
  const present = new Set(
    narrowGroupsToEnvironment(groups, environmentId).map((g) => g.projectKey),
  );
  return scopeKeys.filter((key) => present.has(key));
}

export function narrowEnvironmentIds<TId extends string>(
  environmentIds: ReadonlyArray<TId>,
  environmentId: string | null,
): ReadonlyArray<TId> {
  return environmentId === null
    ? environmentIds
    : environmentIds.filter((id) => id === environmentId);
}
