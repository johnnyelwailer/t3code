import type { ProjectShellProject } from "@t3tools/project-context";

import { isWorkProject } from "~/t3team/t3team-isWorkProject";
import { isHomeProjectId } from "~/t3team/t3team-homeProject";
import type { ProjectThread, ViewState } from "~/t3team/t3team-types";

export function resolveWorkHomeProject(input: {
  readonly allProjects: readonly ProjectShellProject[];
  readonly selectedProjectId: string | null;
  readonly showInitialSetup: boolean;
  readonly hasRouteView: boolean;
}): ProjectShellProject | null {
  if (input.showInitialSetup || input.hasRouteView) return null;
  const selected = input.allProjects.find((project) => project.id === input.selectedProjectId);
  return selected && isWorkProject(selected) ? selected : null;
}

/**
 * Remaps a route view's project id onto the id the shell actually stores, so a
 * loose workspace and its stored counterpart resolve to one project.
 *
 * A draft view is routed by draft id alone: it has no project to remap, and
 * inventing one would make the draft pane resolve the wrong workspace.
 */
export function resolveViewStoredProject(
  view: ViewState | null,
  resolveProjectId: (projectId: string) => string,
): ViewState | null {
  if (!view || view.type === "draft") return view;
  const resolvedProjectId = resolveProjectId(view.projectId);
  return resolvedProjectId === view.projectId ? view : { ...view, projectId: resolvedProjectId };
}

export function resolveEmbeddedThread(
  view: ViewState | null,
  threads: readonly ProjectThread[],
): ProjectThread | null {
  if (view?.type !== "thread" || !view.embeddedThreadId) return null;
  return threads.find((thread) => thread.id === view.embeddedThreadId) ?? null;
}

export function resolveThreadProject(input: {
  readonly activeThreadId: string | null;
  readonly view: ViewState | null;
  readonly allProjects: readonly ProjectShellProject[];
  readonly homeChatProject: ProjectShellProject | null;
}): ProjectShellProject | null {
  if (!input.activeThreadId || !input.view) return null;
  return (
    input.allProjects.find((project) => project.id === input.view?.projectId) ??
    (input.view.type === "thread" && isHomeProjectId(input.view.projectId)
      ? input.homeChatProject
      : null)
  );
}
