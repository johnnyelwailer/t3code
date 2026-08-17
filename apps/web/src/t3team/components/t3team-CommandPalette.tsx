import type { ProjectShellProject } from "@t3tools/project-context";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { APP_DISPLAY_NAME } from "~/t3team/t3team-branding";
import { useServerKeybindings } from "~/t3team/t3team-serverState";
import type { ProjectThread } from "~/t3team/t3team-types";
import {
  Command,
  CommandDialog,
  CommandDialogPopup,
  CommandInput,
  CommandPanel,
} from "~/components/ui/command";
import { CommandPaletteResults } from "~/components/CommandPaletteResults";
import {
  filterCommandPaletteGroups,
  getCommandPaletteInputPlaceholder,
  getCommandPaletteMode,
  type CommandPaletteActionItem,
  type CommandPaletteGroup,
  type CommandPaletteSubmenuItem,
  type CommandPaletteView,
} from "~/components/CommandPalette.logic";
import { useCommandPaletteActionItems } from "~/t3team/components/t3team-commandPaletteActionItems";
import {
  useCommandPaletteEntityItems,
  type CommandPaletteTicketSource,
} from "~/t3team/components/t3team-commandPaletteEntityItems";
import { useCommandPaletteGitHubActivity } from "~/t3team/components/t3team-commandPaletteGitHubActivity";

type T3TeamCommandPaletteProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: ReadonlyArray<ProjectShellProject>;
  threads: ReadonlyArray<ProjectThread>;
  threadSortOrder: "updated_at" | "created_at";
  getTicketsForProject: CommandPaletteTicketSource;
  onSelectProject: (projectId: string) => void;
  onSelectTicket: (projectId: string, ticketId: string) => void;
  onSelectThread: (projectId: string, threadId: string) => void;
  onOpenSettings?: (() => void) | undefined;
  onOpenCreateProject: () => void;
};

export function T3TeamCommandPalette(props: T3TeamCommandPaletteProps) {
  const {
    open,
    onOpenChange,
    projects,
    threads,
    threadSortOrder,
    getTicketsForProject,
    onSelectProject,
    onSelectTicket,
    onSelectThread,
    onOpenSettings,
    onOpenCreateProject,
  } = props;

  const keybindings = useServerKeybindings();
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [viewStack, setViewStack] = useState<CommandPaletteView[]>([]);
  const [highlightedItemValue, setHighlightedItemValue] = useState<string | null>(null);
  const githubActivityItems = useCommandPaletteGitHubActivity(open, projects);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setViewStack([]);
      setHighlightedItemValue(null);
    }
  }, [open]);

  const currentView = viewStack.at(-1) ?? null;

  const { projectItems, threadItems, workItemItems, githubItems } = useCommandPaletteEntityItems({
    projects,
    threads,
    threadSortOrder,
    getTicketsForProject,
    githubActivityItems,
    onSelectProject,
    onSelectTicket,
    onSelectThread,
  });
  const actionItems = useCommandPaletteActionItems({ onOpenCreateProject, onOpenSettings });

  const rootGroups = useMemo<ReadonlyArray<CommandPaletteGroup>>(() => {
    const groups: CommandPaletteGroup[] = [];
    groups.push({ value: "actions", label: "Actions", items: actionItems });
    if (projectItems.length > 0) {
      groups.push({ value: "projects", label: "Projects", items: projectItems });
    }
    if (workItemItems.length > 0) {
      groups.push({ value: "work-items", label: "Work Items", items: workItemItems });
    }
    if (threadItems.length > 0) {
      groups.push({ value: "threads", label: "Threads", items: threadItems });
    }
    if (githubItems.length > 0) {
      groups.push({ value: "github-items", label: "GitHub Items", items: githubItems });
    }
    return groups;
  }, [actionItems, githubItems, projectItems, threadItems, workItemItems]);

  const activeGroups = currentView ? currentView.groups : rootGroups;
  const filteredGroups = useMemo(
    () =>
      filterCommandPaletteGroups({
        activeGroups,
        query: deferredQuery,
        isInSubmenu: true,
        projectSearchItems: [],
        threadSearchItems: [],
      }),
    [activeGroups, deferredQuery],
  );

  const isActionsOnly = deferredQuery.startsWith(">");
  const isSubmenu = currentView !== null;
  const paletteMode = getCommandPaletteMode({ currentView, isBrowsing: false });

  const handleExecuteItem = (item: CommandPaletteActionItem | CommandPaletteSubmenuItem) => {
    if (item.disabled) return;

    if (item.kind === "submenu") {
      setViewStack((existing) => [
        ...existing,
        {
          addonIcon: item.addonIcon,
          groups: item.groups,
          ...(item.initialQuery !== undefined ? { initialQuery: item.initialQuery } : {}),
        },
      ]);
      setHighlightedItemValue(null);
      setQuery(item.initialQuery ?? "");
      return;
    }

    onOpenChange(false);
    void item.run();
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandDialogPopup
        aria-label={`${APP_DISPLAY_NAME} search`}
        className="overflow-hidden p-0"
        finalFocus={() => false}
        onBackdropPointerDown={() => {
          onOpenChange(false);
        }}
      >
        <Command
          key={isSubmenu ? "submenu" : "root"}
          aria-label={`${APP_DISPLAY_NAME} command palette`}
          autoHighlight="always"
          mode="none"
          onItemHighlighted={(value) => {
            setHighlightedItemValue(typeof value === "string" ? value : null);
          }}
          onValueChange={setQuery}
          value={query}
        >
          <CommandInput
            placeholder={getCommandPaletteInputPlaceholder(paletteMode)}
            {...(isSubmenu
              ? {
                  onKeyDown: (event) => {
                    if (event.key === "Backspace" && query.length === 0) {
                      event.preventDefault();
                      setViewStack((existing) => existing.slice(0, -1));
                    }
                  },
                }
              : {})}
          />
          <CommandPanel>
            <CommandPaletteResults
              emptyStateMessage="No results yet. Try a project name, issue key, thread title, or repository."
              groups={filteredGroups}
              highlightedItemValue={highlightedItemValue}
              isActionsOnly={isActionsOnly}
              keybindings={keybindings}
              onExecuteItem={handleExecuteItem}
            />
          </CommandPanel>
        </Command>
      </CommandDialogPopup>
    </CommandDialog>
  );
}
