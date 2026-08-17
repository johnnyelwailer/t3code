import { FolderPlusIcon, SettingsIcon } from "lucide-react";
import { useMemo } from "react";
import {
  ITEM_ICON_CLASS,
  type CommandPaletteActionItem,
  type CommandPaletteSubmenuItem,
} from "~/components/CommandPalette.logic";
import { useCommandPaletteStore } from "~/t3team/t3team-commandPaletteStore";

type ActionItemsInput = {
  onOpenCreateProject: () => void;
  onOpenSettings?: (() => void) | undefined;
};

/** The palette's static "Actions" group: add project (native and Jira) and settings. */
export function useCommandPaletteActionItems(
  input: ActionItemsInput,
): Array<CommandPaletteActionItem | CommandPaletteSubmenuItem> {
  const { onOpenCreateProject, onOpenSettings } = input;
  const openNativeAddProject = useCommandPaletteStore((store) => store.openAddProject);

  return useMemo(() => {
    const items: Array<CommandPaletteActionItem | CommandPaletteSubmenuItem> = [
      {
        kind: "action",
        value: "t3team:create-project:native",
        searchTerms: [
          "project",
          "add project",
          "new project",
          "local",
          "folder",
          "browse",
          "clone",
          "remote",
          "repository",
          "git",
          "github",
          "gitlab",
          "bitbucket",
          "azure",
          "devops",
          "url",
        ],
        title: "Add local/remote project...",
        description: "Add a project from a folder or Git repository",
        icon: <FolderPlusIcon className={ITEM_ICON_CLASS} />,
        run: async () => {
          openNativeAddProject();
        },
      },
      {
        kind: "action",
        value: "t3team:create-project:jira",
        searchTerms: ["jira", "atlassian", "new project", "import"],
        title: "Add Jira project...",
        description: "Connect Jira and import a project",
        icon: <FolderPlusIcon className={ITEM_ICON_CLASS} />,
        run: async () => {
          onOpenCreateProject();
        },
      },
    ];

    if (onOpenSettings) {
      items.push({
        kind: "action",
        value: "t3team:action:settings",
        searchTerms: ["settings", "preferences"],
        title: "Open settings",
        icon: <SettingsIcon className={ITEM_ICON_CLASS} />,
        run: async () => {
          onOpenSettings();
        },
      });
    }

    return items;
  }, [onOpenCreateProject, onOpenSettings, openNativeAddProject]);
}
