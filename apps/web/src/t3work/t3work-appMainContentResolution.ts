import type { ProjectShellProject } from "@t3tools/project-context";

import { isWorkProject } from "~/t3work/t3work-isWorkProject";
import { isHomeProjectId } from "~/t3work/t3work-homeProject";
import type { ProjectThread, ViewState } from "~/t3work/t3work-types";

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
