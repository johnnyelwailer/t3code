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
  if (storedRoot) {
    const liveProject = input.liveProjects.find((candidate) =>
      matchesT3TeamWorkspaceRoot(candidate.workspaceRoot, storedRoot),
    );
    if (liveProject) {
      return {
        environmentId: liveProject.environmentId,
        cwd: normalizeRootPath(liveProject.workspaceRoot) ?? liveProject.workspaceRoot,
      };
    }
  }
  return { environmentId: input.primaryEnvironmentId, cwd: storedRoot };
}

/** React binding for {@link resolveT3TeamKickoffPathSearchScope}. */
export function useT3TeamKickoffPathSearchScope(
  workspaceRoot: string | null,
): T3TeamComposerPathSearchScope {
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const liveProjects = useProjects();
  return useMemo(
    () =>
      resolveT3TeamKickoffPathSearchScope({
        workspaceRoot,
        primaryEnvironmentId,
        liveProjects,
      }),
    [liveProjects, primaryEnvironmentId, workspaceRoot],
  );
}
