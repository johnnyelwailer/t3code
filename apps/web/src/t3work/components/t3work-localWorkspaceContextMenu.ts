import { readLocalApi } from "~/localApi";

export type LocalWorkspaceContextMenuInput = {
  clientX: number;
  clientY: number;
  projectTitle: string;
  workspaceRoot: string | null;
  threadCount: number;
  onBeginRename: () => void;
  onRemove: () => void;
};

export function buildLocalWorkspaceContextMenuItems() {
  return [
    { id: "rename", label: "Rename workspace" },
    { id: "copy-path", label: "Copy Path" },
    { id: "remove", label: "Remove", destructive: true },
  ] as const;
}

export async function showLocalWorkspaceContextMenu(
  input: LocalWorkspaceContextMenuInput,
): Promise<void> {
  const api = readLocalApi();
  if (!api) return;

  const action = await api.contextMenu.show(buildLocalWorkspaceContextMenuItems(), {
    x: input.clientX,
    y: input.clientY,
  });

  if (action === "rename") {
    input.onBeginRename();
    return;
  }
  if (action === "copy-path") {
    if (input.workspaceRoot) {
      void navigator.clipboard.writeText(input.workspaceRoot);
    }
    return;
  }
  if (action === "remove") {
    const message =
      input.threadCount > 0
        ? `Remove "${input.projectTitle}" and delete its ${input.threadCount} thread${
            input.threadCount === 1 ? "" : "s"
          } from this workspace?`
        : `Remove "${input.projectTitle}" from the sidebar?`;
    const confirmed = await api.dialogs.confirm(message);
    if (confirmed) {
      input.onRemove();
    }
  }
}
