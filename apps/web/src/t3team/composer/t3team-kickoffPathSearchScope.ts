import { useMemo } from "react";
import type { EnvironmentId } from "@t3tools/contracts";
import type { EnvironmentProject } from "@t3tools/client-runtime/state/shell";

import { useProjects } from "~/state/entities";
import { usePrimaryEnvironmentId } from "~/state/environments";
import type { T3TeamComposerPathSearchScope } from "~/t3team/composer/t3team-composerPathSearchTarget";

export type T3TeamKickoffPathSearchProject = Pick<
  EnvironmentProject,
  "id" | "workspaceRoot" | "environmentId"
>;

function normalizeRootPath(input: string | null | undefined): string | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim().replaceAll("\\", "/");
  if (trimmed.length === 0) return null;
  const withoutTrailingSlash = trimmed.replace(/\/+$/, "");
  return withoutTrailingSlash.length > 0 ? withoutTrailingSlash : trimmed;
}

/**
 * True when a live (environment-registered) workspace root denotes the same
 * directory as a stored t3team workspace root.
 *
 * t3team persists managed workspace roots home-relative (`~/.t3code/...`) while
 * the environment reports them absolute, and the browser cannot expand `~`
 * (no `HOME`). Comparing home-relative paths by suffix keeps the two spellings
 * matchable without inventing a home directory.
 */
export function matchesT3TeamWorkspaceRoot(
  liveWorkspaceRoot: string,
  storedWorkspaceRoot: string,
): boolean {
  const live = normalizeRootPath(liveWorkspaceRoot);
  const stored = normalizeRootPath(storedWorkspaceRoot);
  if (!live || !stored) return false;
  if (live === stored) return true;
  if (stored === "~") return false;
  if (!stored.startsWith("~/")) return false;
  return live.endsWith(`/${stored.slice(2)}`);
}

/**
 * Resolves the `@` path-search scope for the kickoff composers.
 *
 * The chat composer searches the *environment-registered* project: ChatView
 * derives its `gitCwd` from the live project's `workspaceRoot` and passes that
 * project's `environmentId` down. The kickoff surfaces only had the t3team
 * project's stored `workspace.rootPath` plus the primary environment id, which
 * can disagree with the environment that actually owns the workspace (and can be
 * home-relative). Preferring the matching live project makes both surfaces query
 * the exact same workspace; the stored root plus primary environment stay as the
 * fallback.
 */
export function resolveT3TeamKickoffPathSearchScope(input: {
  readonly workspaceRoot: string | null;
  readonly primaryEnvironmentId: EnvironmentId | null;
  readonly liveProjects: ReadonlyArray<T3TeamKickoffPathSearchProject>;
}): T3TeamComposerPathSearchScope {
  const storedRoot = normalizeRootPath(input.workspaceRoot);
  const liveProject = findLiveProject(storedRoot, input.liveProjects);
  if (liveProject) {
    return {
      environmentId: liveProject.environmentId,
      cwd: normalizeRootPath(liveProject.workspaceRoot) ?? liveProject.workspaceRoot,
    };
  }
  return { environmentId: input.primaryEnvironmentId, cwd: storedRoot };
}

function findLiveProject(
  storedRoot: string | null,
  liveProjects: ReadonlyArray<T3TeamKickoffPathSearchProject>,
): T3TeamKickoffPathSearchProject | undefined {
  if (!storedRoot) return undefined;
  return liveProjects.find((candidate) =>
    matchesT3TeamWorkspaceRoot(candidate.workspaceRoot, storedRoot),
  );
}

/**
 * The workspace whose provider skills and slash commands a kickoff composer offers. Provider
 * workspace snapshots are keyed by the exact cwd string the scan was requested for, and the thread
 * composer requests it with the live project's `workspaceRoot` verbatim (its `gitCwd`), so this
 * keeps that spelling rather than the normalized path-search one.
 */
export function resolveT3TeamKickoffProviderWorkspace(input: {
  readonly workspaceRoot: string | null;
  readonly primaryEnvironmentId: EnvironmentId | null;
  readonly liveProjects: ReadonlyArray<T3TeamKickoffPathSearchProject>;
}): T3TeamComposerPathSearchScope {
  const liveProject = findLiveProject(normalizeRootPath(input.workspaceRoot), input.liveProjects);
  if (liveProject) {
    return { environmentId: liveProject.environmentId, cwd: liveProject.workspaceRoot };
  }
  return { environmentId: input.primaryEnvironmentId, cwd: input.workspaceRoot };
}

/** React binding for the kickoff composer's path-search and provider-workspace scopes. */
export function useT3TeamKickoffWorkspaceScopes(workspaceRoot: string | null): {
  pathSearch: T3TeamComposerPathSearchScope;
  providerWorkspace: T3TeamComposerPathSearchScope;
} {
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const liveProjects = useProjects();
  return useMemo(() => {
    const input = { workspaceRoot, primaryEnvironmentId, liveProjects };
    return {
      pathSearch: resolveT3TeamKickoffPathSearchScope(input),
      providerWorkspace: resolveT3TeamKickoffProviderWorkspace(input),
    };
  }, [liveProjects, primaryEnvironmentId, workspaceRoot]);
}
