import type { ProjectShellProject } from "@t3tools/project-context";
import { FolderIcon, GithubIcon, SquarePenIcon, TicketIcon } from "lucide-react";
import { useMemo } from "react";
import { ITEM_ICON_CLASS, type CommandPaletteActionItem } from "~/components/CommandPalette.logic";
import { readLocalApi } from "~/localApi";
import { sortThreads } from "~/t3team/components/t3team-projectSidebarShared";
import type { ProjectGitHubActivitySearchItem } from "~/t3team/components/t3team-commandPaletteGitHubActivity";
import type { ProjectThread } from "~/t3team/t3team-types";

export type CommandPaletteTicketSource = (projectId: string) => ReadonlyArray<{
  id: string;
  status: string;
  assignee?: string;
  ref: {
    displayId: string;
    title: string;
  };
}>;

type EntityItemsInput = {
  projects: ReadonlyArray<ProjectShellProject>;
  threads: ReadonlyArray<ProjectThread>;
  threadSortOrder: "updated_at" | "created_at";
  getTicketsForProject: CommandPaletteTicketSource;
  githubActivityItems: ReadonlyArray<ProjectGitHubActivitySearchItem>;
  onSelectProject: (projectId: string) => void;
  onSelectTicket: (projectId: string, ticketId: string) => void;
  onSelectThread: (projectId: string, threadId: string) => void;
};

/** The palette's searchable entity rows: projects, threads, work items, GitHub activity. */
export function useCommandPaletteEntityItems(input: EntityItemsInput) {
  const {
    projects,
    threads,
    threadSortOrder,
    getTicketsForProject,
    githubActivityItems,
    onSelectProject,
    onSelectTicket,
    onSelectThread,
  } = input;

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
        value: `t3team:project:${project.id}`,
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
          value: `t3team:thread:${thread.id}`,
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
        value: `t3team:ticket:${ticket.ticketId}`,
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
        value: `t3team:github:${item.projectId}:${item.id}`,
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

  return { projectItems, threadItems, workItemItems, githubItems };
}
