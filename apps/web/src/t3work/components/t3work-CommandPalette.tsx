/* oxlint-disable eslint/no-unused-vars -- Existing merged lint debt; keep green while preserving behavior. */
import type { ProjectShellProject } from "@t3tools/project-context";
import { AsyncResult } from "effect/unstable/reactivity";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { usePrimaryEnvironmentId } from "~/state/environments";
import { sourceControlEnvironment } from "~/state/sourceControl";
import { useAtomQueryRunner } from "~/state/use-atom-query-runner";
import { readLocalApi } from "~/localApi";
import { useServerKeybindings } from "~/t3work/t3work-serverState";
import { useCommandPaletteStore } from "~/t3work/t3work-commandPaletteStore";
import type { ProjectThread } from "~/t3work/t3work-types";
import {
  Command,
  CommandDialog,
  CommandDialogPopup,
  CommandInput,
  CommandPanel,
} from "~/components/ui/command";
import { CommandPaletteResults } from "~/components/CommandPaletteResults";
import {
  ADDON_ICON_CLASS,
  filterCommandPaletteGroups,
  getCommandPaletteInputPlaceholder,
  getCommandPaletteMode,
  ITEM_ICON_CLASS,
  type CommandPaletteActionItem,
  type CommandPaletteGroup,
  type CommandPaletteSubmenuItem,
  type CommandPaletteView,
} from "~/components/CommandPalette.logic";
import {
  FolderIcon,
  FolderPlusIcon,
  GithubIcon,
  SettingsIcon,
  SquarePenIcon,
  TicketIcon,
} from "lucide-react";
import { sortThreads } from "~/t3work/components/t3work-projectSidebarShared";
import { useBackend } from "~/t3work/backend/t3work-index";
import { readLinkedRepositoryUrlsFromProject } from "~/t3work/hooks/t3work-createProjectBootstrap";
import {
  parseGitHubHostFromDiscovery,
  toGitHubWorkActivityItems,
} from "~/t3work/t3work-githubActivity";
import {
  normalizeCacheList,
  readIntegrationCache,
  writeIntegrationCache,
} from "~/t3work/hooks/t3work-integrationCache";

type ProjectGitHubActivitySearchItem = {
  projectId: string;
  projectTitle: string;
  id: string;
  repository: string;
  reason: string;
  subjectTitle?: string;
  subjectUrl?: string;
  workItemKey?: string;
};

type CommandPaletteGitHubCache = {
  readonly host: string;
  readonly items: ReadonlyArray<ProjectGitHubActivitySearchItem>;
};

type T3workCommandPaletteProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: ReadonlyArray<ProjectShellProject>;
  threads: ReadonlyArray<ProjectThread>;
  threadSortOrder: "updated_at" | "created_at";
  getTicketsForProject: (projectId: string) => ReadonlyArray<{
    id: string;
    status: string;
    assignee?: string;
    ref: {
      displayId: string;
      title: string;
    };
  }>;
  onSelectProject: (projectId: string) => void;
  onSelectTicket: (projectId: string, ticketId: string) => void;
  onSelectThread: (projectId: string, threadId: string) => void;
  onOpenSettings?: (() => void) | undefined;
  onOpenCreateProject: () => void;
};

export function T3workCommandPalette(props: T3workCommandPaletteProps) {
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

  const backend = useBackend();
  const environmentId = usePrimaryEnvironmentId();
  const discoverSourceControl = useAtomQueryRunner(sourceControlEnvironment.discovery, {
    reportFailure: false,
  });
  const openNativeAddProject = useCommandPaletteStore((store) => store.openAddProject);
  const keybindings = useServerKeybindings();
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [viewStack, setViewStack] = useState<CommandPaletteView[]>([]);
  const [highlightedItemValue, setHighlightedItemValue] = useState<string | null>(null);
  const [githubActivityItems, setGitHubActivityItems] = useState<
    ReadonlyArray<ProjectGitHubActivitySearchItem>
  >([]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setViewStack([]);
      setHighlightedItemValue(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open || !backend) {
      setGitHubActivityItems([]);
      return;
    }

    let cancelled = false;

    const load = async () => {
      const cacheKey = `github:commandPalette:${projects
        .map((project) =>
          [
            project.id,
            project.source.externalProjectKey ?? "none",
            project.title,
            normalizeCacheList(readLinkedRepositoryUrlsFromProject(project)),
          ].join(":"),
        )
        .toSorted((a, b) => a.localeCompare(b))
        .join(";")}`;
      const cached = readIntegrationCache<CommandPaletteGitHubCache>(cacheKey)?.value;
      if (cached?.items && cached.items.length > 0) {
        setGitHubActivityItems(cached.items);
      }

      let host = cached?.host ?? "github.com";
      if (environmentId !== null) {
        const discoveryResult = await discoverSourceControl({
          environmentId,
          input: {},
        });
        host = AsyncResult.isSuccess(discoveryResult)
          ? parseGitHubHostFromDiscovery(discoveryResult.value)
          : "github.com";
      }

      const results = await Promise.all(
        projects.map(async (project) => {
          const linkedRepositoryUrls = readLinkedRepositoryUrlsFromProject(project);
          try {
            const response = await backend.github.discoverInbox({
              host,
              ...(project.source.externalProjectKey
                ? { projectKey: project.source.externalProjectKey }
                : {}),
              ...(project.title ? { projectTitle: project.title } : {}),
              linkedRepositoryUrls,
            });
            return toGitHubWorkActivityItems(response.inboxItems).map((item) => {
              const searchItem: ProjectGitHubActivitySearchItem = {
                projectId: project.id,
                projectTitle: project.title,
                id: item.id,
                repository: item.repository,
                reason: item.reason,
              };
              if (item.subjectTitle) {
                searchItem.subjectTitle = item.subjectTitle;
              }
              if (item.subjectUrl) {
                searchItem.subjectUrl = item.subjectUrl;
              }
              if (item.workItemKey) {
                searchItem.workItemKey = item.workItemKey;
              }
              return searchItem;
            });
          } catch {
            return [];
          }
        }),
      );

      if (cancelled) return;
      const nextItems = results.flat();
      writeIntegrationCache(cacheKey, { host, items: nextItems });
      setGitHubActivityItems(nextItems);
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [backend, discoverSourceControl, environmentId, open, projects]);

  const currentView = viewStack.at(-1) ?? null;

  const ticketRows = useMemo(
    () =>
      projects.flatMap((project) =>
        getTicketsForProject(project.id).map((ticket) => ({
          projectId: project.id,
          projectTitle: project.title,
          ticketId: ticket.id,
          displayId: ticket.ref.displayId,
          title: ticket.ref.title,
          status: ticket.status,
          assignee: ticket.assignee,
        })),
      ),
    [getTicketsForProject, projects],
  );

  const projectItems = useMemo<CommandPaletteActionItem[]>(
    () =>
      projects.map((project) => ({
        kind: "action",
        value: `t3work:project:${project.id}`,
        searchTerms: [project.title, project.id],
        title: project.title,
        description: "Project",
        icon: <FolderIcon className={ITEM_ICON_CLASS} />,
        run: async () => {
          onSelectProject(project.id);
        },
      })),
    [onSelectProject, projects],
  );

  const threadItems = useMemo<CommandPaletteActionItem[]>(
    () =>
      sortThreads([...threads], threadSortOrder).map((thread) => {
        const projectTitle = projects.find((project) => project.id === thread.projectId)?.title;
        return {
          kind: "action" as const,
          value: `t3work:thread:${thread.id}`,
          searchTerms: [thread.title, thread.projectId, projectTitle ?? "", thread.ticketId ?? ""],
          title: thread.title,
          description: projectTitle ? `Thread in ${projectTitle}` : "Thread",
          icon: <SquarePenIcon className={ITEM_ICON_CLASS} />,
          run: async () => {
            onSelectThread(thread.projectId, thread.id);
          },
        };
      }),
    [onSelectThread, projects, threadSortOrder, threads],
  );

  const workItemItems = useMemo<CommandPaletteActionItem[]>(
    () =>
      ticketRows.map((ticket) => ({
        kind: "action",
        value: `t3work:ticket:${ticket.ticketId}`,
        searchTerms: [
          ticket.displayId,
          ticket.title,
          ticket.projectTitle,
          ticket.status,
          ticket.assignee ?? "",
        ],
        title: `${ticket.displayId} ${ticket.title}`,
        description: `${ticket.projectTitle} · ${ticket.status}`,
        icon: <TicketIcon className={ITEM_ICON_CLASS} />,
        run: async () => {
          onSelectTicket(ticket.projectId, ticket.ticketId);
        },
      })),
    [onSelectTicket, ticketRows],
  );

  const githubItems = useMemo<CommandPaletteActionItem[]>(
    () =>
      githubActivityItems.map((item) => ({
        kind: "action",
        value: `t3work:github:${item.projectId}:${item.id}`,
        searchTerms: [
          item.projectTitle,
          item.repository,
          item.reason,
          item.subjectTitle ?? "",
          item.workItemKey ?? "",
        ],
        title: item.subjectTitle ?? `${item.repository} activity`,
        description: `${item.projectTitle} · ${item.repository} · ${item.reason}`,
        icon: <GithubIcon className={ITEM_ICON_CLASS} />,
        run: async () => {
          if (item.workItemKey) {
            const matching = ticketRows.find(
              (ticket) =>
                ticket.projectId === item.projectId &&
                ticket.displayId.toUpperCase() === item.workItemKey?.toUpperCase(),
            );
            if (matching) {
              onSelectTicket(matching.projectId, matching.ticketId);
              return;
            }
          }

          if (item.subjectUrl) {
            const localApi = readLocalApi();
            if (localApi) {
              await localApi.shell.openExternal(item.subjectUrl);
            }
          }
        },
      })),
    [githubActivityItems, onSelectTicket, ticketRows],
  );

  const actionItems = useMemo<Array<CommandPaletteActionItem | CommandPaletteSubmenuItem>>(() => {
    const items: Array<CommandPaletteActionItem | CommandPaletteSubmenuItem> = [
      {
        kind: "action",
        value: "t3work:create-project:native",
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
        value: "t3work:create-project:jira",
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
        value: "t3work:action:settings",
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
        aria-label="T3 Work search"
        className="overflow-hidden p-0"
        finalFocus={() => false}
        onBackdropPointerDown={() => {
          onOpenChange(false);
        }}
      >
        <Command
          key={isSubmenu ? "submenu" : "root"}
          aria-label="T3 Work command palette"
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
