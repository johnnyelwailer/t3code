/* oxlint-disable eslint/no-unused-vars -- Existing merged lint debt; keep green while preserving behavior. */
import type { ProjectTicket } from "~/t3work/t3work-types";
import { readLocalApi } from "~/localApi";
export { buildPinnedOnlyMyActivityFeed } from "./t3work-projectSidebarPinnedOnlyFeed";
export {
  computeHiddenTicketCount,
  deriveTicketVisibility,
} from "./t3work-projectSidebarTicketVisibility";

type ProjectContextMenuInput = {
  clientX: number;
  clientY: number;
  projectId: string;
  projectTitle: string;
  onManageProjectRecipes: (projectId: string) => void;
  onManageProjectRepositories: (projectId: string) => void;
  onDeleteProject: (projectId: string) => void;
  onBeginRename: () => void;
};

export function buildProjectContextMenuItems() {
  return [
    { id: "rename", label: "Rename project" },
    { id: "manage-recipes", label: "Manage recipes" },
    { id: "manage-repositories", label: "Manage linked repositories" },
    { id: "delete", label: "Delete project", destructive: true },
  ] as const;
}

export async function showProjectContextMenu(input: ProjectContextMenuInput): Promise<void> {
  const api = readLocalApi();
  if (!api) return;

  const action = await api.contextMenu.show(buildProjectContextMenuItems(), {
    x: input.clientX,
    y: input.clientY,
  });

  if (action === "rename") {
    input.onBeginRename();
    return;
  }
  if (action === "manage-repositories") {
    input.onManageProjectRepositories(input.projectId);
    return;
  }
  if (action === "manage-recipes") {
    input.onManageProjectRecipes(input.projectId);
    return;
  }
  if (action !== "delete") {
    return;
  }
  const confirmed = await api.dialogs.confirm(`Delete project "${input.projectTitle}"?`);
  if (confirmed) {
    input.onDeleteProject(input.projectId);
  }
}
