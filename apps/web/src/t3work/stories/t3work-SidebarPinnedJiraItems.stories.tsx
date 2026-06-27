/* oxlint-disable react/no-object-type-as-default-prop -- Existing merged lint debt; keep green while preserving behavior. */
import { useEffect } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import type { ProjectShellProject } from "@t3tools/project-context";

import { BackendProvider } from "~/t3work/backend/t3work-BackendContext";
import type { BackendApi } from "~/t3work/backend/t3work-types";
import { ProjectSidebarPinnedItems } from "~/t3work/components/t3work-ProjectSidebarPinnedItems";
import type { ResolvedPinnedSidebarItem } from "~/t3work/components/t3work-useProjectSidebarPinnedItems";
import {
  buildTicketSidebarPinnedItem,
  buildTicketSidebarPinnedItemId,
} from "~/t3work/t3work-sidebarPinningTypes";
import type { T3WorkSidebarPinnedItem } from "~/t3work/t3work-sidebarPinningTypes";
import { useT3WorkPinnedSidebarStore } from "~/t3work/t3work-pinnedSidebarStore";
import { useT3WorkSidebarNavPreferencesStore } from "~/t3work/t3work-sidebarNavPreferencesStore";
import type { ProjectTicket } from "~/t3work/t3work-types";

const project: ProjectShellProject = {
  id: "project-1",
  title: "Alpha",
  source: { provider: "atlassian", accountId: "acct-1" },
  workspace: { rootPath: "/workspace/alpha" },
} as ProjectShellProject;

const tickets: readonly ProjectTicket[] = [
  createTicket("ticket-1", "PROJ-9", "Prepare release checklist"),
  createTicket("ticket-2", "PROJ-10", "Ship nav reordering"),
];

const pinnedItems: ReadonlyArray<ResolvedPinnedSidebarItem> = tickets.map((ticket, index) => ({
  kind: "jira-work-item",
  pinnedItem: buildTicketSidebarPinnedItem({
    projectId: project.id,
    ticketId: ticket.id,
    pinnedAt: `2026-05-23T12:00:0${index}.000Z`,
  }) as Extract<T3WorkSidebarPinnedItem, { kind: "jira-work-item" }>,
  ticket,
  ticketThreads: [],
}));

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

function SidebarPinnedJiraItemsStory({ orderedTicketIds = [] }: { orderedTicketIds?: string[] }) {
  useEffect(() => {
    const orderedItemIds = orderedTicketIds.map((ticketId) =>
      buildTicketSidebarPinnedItemId({ projectId: project.id, ticketId }),
    );
    useT3WorkPinnedSidebarStore.setState({
      hydrated: true,
      items: pinnedItems.map((item) => item.pinnedItem),
    });
    useT3WorkSidebarNavPreferencesStore.setState({
      hydrated: true,
      preferencesByProjectId: {
        [project.id]: {
          hiddenItemIds: [],
          orderedItemIds,
        },
      },
    });

    return () => {
      useT3WorkPinnedSidebarStore.setState({ hydrated: true, items: [] });
      useT3WorkSidebarNavPreferencesStore.setState({ hydrated: true, preferencesByProjectId: {} });
    };
  }, [orderedTicketIds]);

  return (
    <BackendProvider backend={backend}>
      <div className="flex min-h-screen items-start justify-center bg-sidebar p-6">
        <div className="w-[320px] rounded-xl border border-border/70 bg-card p-3 shadow-sm">
          <div className="mb-3 text-xs text-muted-foreground">
            Hover a Jira row in this left-nav slice to reveal the actions button. Right-clicking the
            row opens the same menu.
          </div>
          <ProjectSidebarPinnedItems
            project={project}
            projectTickets={[...tickets]}
            githubActivityByWorkItem={new Map()}
            items={pinnedItems}
            view={null}
            visibleTicketIds={new Set(tickets.map((ticket) => ticket.id))}
            onSelectTicket={() => {}}
          />
        </div>
      </div>
    </BackendProvider>
  );
}

const meta = {
  title: "T3work/Sidebar/Pinned Jira Items",
  component: SidebarPinnedJiraItemsStory,
} satisfies Meta<typeof SidebarPinnedJiraItemsStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const DefaultOrder: Story = {
  args: { orderedTicketIds: [] },
};

export const Reordered: Story = {
  args: { orderedTicketIds: ["ticket-2", "ticket-1"] },
};
