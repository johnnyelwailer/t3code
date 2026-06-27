import type { LocalApi } from "@t3tools/contracts";
import type { ProjectShellProject } from "@t3tools/project-context";

import { BackendProvider } from "~/t3work/backend/t3work-BackendContext";
import type { BackendApi } from "~/t3work/backend/t3work-types";
import { sortSidebarItemsByStoredOrderById } from "~/t3work/t3work-sidebarNavPreferences";
import { buildTicketSidebarPinnedItemId } from "~/t3work/t3work-sidebarPinningTypes";
import type { ProjectTicket } from "~/t3work/t3work-types";

import { TicketSidebarEntry } from "./t3work-ProjectSidebarTicketEntry";
import { useProjectSidebarNavItemPreferences } from "./t3work-useProjectSidebarNavItemPreferences";

export const project: ProjectShellProject = {
  id: "project-1",
  title: "Alpha",
  source: { provider: "atlassian", accountId: "acct-1" },
  workspace: { rootPath: "/workspace/alpha" },
} as ProjectShellProject;

const tickets: readonly ProjectTicket[] = [
  createTicket("ticket-1", "PROJ-9", "Prepare release checklist"),
  createTicket("ticket-2", "PROJ-10", "Ship nav reordering"),
];

const backend = {
  state: {
    connectionStatus: "connected",
    serverConfig: null,
    providers: [],
    error: null,
  },
  connect: async () => {},
  disconnect: async () => {},
  dispatchCommand: async () => {},
  listThreadPlacements: async () => [],
  syncThreadToolContext: async () => {},
  atlassian: {},
  github: {},
  projectWorkspace: {},
} as unknown as BackendApi;

function createTicket(id: string, displayId: string, title: string): ProjectTicket {
  return {
    id,
    projectId: project.id,
    ref: {
      provider: "atlassian",
      kind: "issue",
      id,
      displayId,
      title,
      type: "Story",
      url: `https://example.test/${displayId}`,
      projectId: "alpha",
    },
    issueType: "Story",
    status: "In Progress",
    updatedAt: "2026-05-23T12:00:00.000Z",
  };
}

export function JiraTicketEntryHarness() {
  const { orderedItemIds } = useProjectSidebarNavItemPreferences(project.id);
  const orderedTickets = sortSidebarItemsByStoredOrderById(tickets, orderedItemIds, (ticket) =>
    buildTicketSidebarPinnedItemId({ projectId: project.id, ticketId: ticket.id }),
  );
  const scopeItemIds = orderedTickets.map((ticket) =>
    buildTicketSidebarPinnedItemId({ projectId: project.id, ticketId: ticket.id }),
  );

  return (
    <BackendProvider backend={backend}>
      <div className="w-[320px] space-y-1 rounded-lg border border-border/70 bg-card p-2">
        {orderedTickets.map((ticket) => (
          <TicketSidebarEntry
            key={ticket.id}
            project={project}
            projectTickets={[...tickets]}
            ticket={ticket}
            projectId={project.id}
            view={null}
            ticketThreads={[]}
            githubActivityItems={[]}
            showGitHubActivity={false}
            onSelectTicket={() => {}}
            onCreateTicketThread={() => "thread-1"}
            onSelectThread={() => {}}
            onDeleteThread={() => {}}
            onRenameThread={() => {}}
            sidebarNavOrderScopeIds={scopeItemIds}
          />
        ))}
      </div>
    </BackendProvider>
  );
}

export function readRowOrder(host: HTMLElement): string[] {
  return [...host.querySelectorAll<HTMLElement>('[draggable="true"]')].map((row) => {
    const displayId = row.querySelector(".font-medium")?.textContent?.trim();
    return displayId ?? "";
  });
}

export function findDraggableRow(host: HTMLElement, displayId: string): HTMLElement | null {
  return (
    [...host.querySelectorAll<HTMLElement>('[draggable="true"]')].find((row) =>
      row.textContent?.includes(displayId),
    ) ?? null
  );
}

export function createNativeApiMock(input?: {
  showContextMenu?: ReturnType<typeof import("vite-plus/test").vi.fn>;
  setClientSettings?: ReturnType<typeof import("vite-plus/test").vi.fn>;
}): NonNullable<Window["nativeApi"]> {
  return {
    contextMenu: {
      show: input?.showContextMenu,
    },
    persistence: {
      getClientSettings: async () => null,
      setClientSettings: input?.setClientSettings ?? (async () => undefined),
    },
    dialogs: {} as LocalApi["dialogs"],
    shell: {} as LocalApi["shell"],
    server: {} as LocalApi["server"],
  } as unknown as NonNullable<Window["nativeApi"]>;
}
