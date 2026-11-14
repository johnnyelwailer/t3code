/**
 * The pills' selection as the scope every other surface starts from: a project group, an
 * environment, both, or neither. Shared by the web sidebar consumers and the mobile Home list.
 */

export interface PillScopeProjectRef {
  readonly environmentId: string;
  readonly projectId: string;
}

export interface PillScope<TRef extends PillScopeProjectRef = PillScopeProjectRef> {
  /** The selected environment pill, or null for "All". */
  readonly environmentId: string | null;
  /** Every physical project the selected project pill spans, or null for "All projects". */
  readonly projectRefs: ReadonlyArray<TRef> | null;
}

export const UNSCOPED_PILL_SCOPE: PillScope = { environmentId: null, projectRefs: null };

/** The runtime flag, `FEATURE_FLAG_DEFINITIONS.UI_PILL_GLOBAL_SCOPE` (on by default). */
export const PILL_SCOPE_FLAG = "UI_PILL_GLOBAL_SCOPE";

/**
 * On unless a server advertises the flag off, for a client with no primary server (the phone):
 * a server that predates the flag keeps the default.
 */
export function pillScopeFlagOn(
  configs: Iterable<{ readonly featureFlags?: Readonly<Record<string, boolean>> }>,
): boolean {
  for (const config of configs) {
    if (config.featureFlags?.[PILL_SCOPE_FLAG] === false) return false;
  }
  return true;
}

export function isPillScoped(scope: PillScope): boolean {
  return scope.environmentId !== null || (scope.projectRefs?.length ?? 0) > 0;
}

function inEnvironment(scope: PillScope, environmentId: string): boolean {
  return scope.environmentId === null || scope.environmentId === environmentId;
}

function inProjects(scope: PillScope, item: PillScopeProjectRef): boolean {
  const refs = scope.projectRefs;
  if (refs === null || refs.length === 0) return true;
  return refs.some(
    (ref) => ref.environmentId === item.environmentId && ref.projectId === item.projectId,
  );
}

/**
 * Whether a thread or project belongs to the scope. A project pill with no copy in the selected
 * environment narrows nothing: the sidebar drops that project scope, so the environment alone holds.
 */
export function createPillScopeFilter(
  scope: PillScope,
  projects: ReadonlyArray<{ readonly environmentId: string; readonly id: string }>,
): (item: PillScopeProjectRef) => boolean {
  if (!isPillScoped(scope)) return () => true;
  const projectsHold = projects.some(
    (project) =>
      inEnvironment(scope, project.environmentId) &&
      inProjects(scope, { environmentId: project.environmentId, projectId: project.id }),
  );
  return (item) =>
    inEnvironment(scope, item.environmentId) && (!projectsHold || inProjects(scope, item));
}

/**
 * The project a new thread starts in: the first in-scope project on a reachable environment, in
 * the user's order; `fallback` when the scope is empty or every in-scope project is unreachable.
 */
export function pickPillScopedProject<
  T extends { readonly environmentId: string; readonly id: string },
>(input: {
  readonly orderedProjects: ReadonlyArray<T>;
  readonly scope: PillScope;
  readonly offlineEnvironmentIds: ReadonlySet<string>;
  readonly fallback: T | undefined;
}): T | undefined {
  if (!isPillScoped(input.scope)) return input.fallback;
  const inScope = createPillScopeFilter(input.scope, input.orderedProjects);
  return (
    input.orderedProjects.find(
      (project) =>
        inScope({ environmentId: project.environmentId, projectId: project.id }) &&
        !input.offlineEnvironmentIds.has(project.environmentId),
    ) ?? input.fallback
  );
}

/** The stored environment selection while its environment is still switched on; else "All". */
export function enabledPillEnvironmentId(
  storedEnvironmentId: string | null,
  enabledEnvironmentIds: ReadonlySet<string>,
): string | null {
  return storedEnvironmentId !== null && enabledEnvironmentIds.has(storedEnvironmentId)
    ? storedEnvironmentId
    : null;
}
