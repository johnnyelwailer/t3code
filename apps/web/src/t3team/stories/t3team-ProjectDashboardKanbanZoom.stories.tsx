import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";

import { ProjectDashboardKanban } from "~/t3team/t3team-ProjectDashboardKanban";
import { ProjectDashboardKanbanZoomControl } from "~/t3team/t3team-ProjectDashboardKanbanZoomControl";
import { KANBAN_ZOOM_LEVELS, type KanbanZoomLevel } from "~/t3team/t3team-kanbanZoom";
import { createProjectBacklogTestTicket as createTicket } from "~/t3team/t3team-projectBacklogTestUtils";
import { projectDashboardKanbanMatrixFixtureBoardColumns } from "~/t3team/t3team-projectDashboardKanbanMatrixFixtures";
import { buildProjectTicketKanbanColumns } from "~/t3team/t3team-projectTicketStatus";
import { buildProjectTicketHierarchy } from "~/t3team/t3team-ticketHierarchy";
import type { ProjectTicket } from "~/t3team/t3team-types";
// Storybook vite aliases `useKanbanSemanticZoomFlag` to this mock via a string
// path knip cannot follow; the direct import keeps the mock file reachable.
import { useKanbanSemanticZoomFlag as useKanbanSemanticZoomFlagStory } from "../t3team-useKanbanSemanticZoomFlag.storyMock";

void useKanbanSemanticZoomFlagStory;

/**
 * Flat-board fixture: mixed assignees, child counts, priorities and title
 * lengths across the five shared lanes so every density level has something
 * distinct to say. The zoom flag is advertised for the Storybook build via
 * the t3team-storybook-main.ts alias on useKanbanSemanticZoomFlag.
 */
const kanbanZoomFixtureTickets: readonly ProjectTicket[] = [
  createTicket({
    id: "zoom-101",
    status: "To Do",
    ref: { displayId: "NEX-101", title: "Prepare the release notes for the 4.2 cut" },
  }),
  createTicket({
    id: "zoom-102",
    status: "To Do",
    assignee: "Philip",
    ref: { displayId: "NEX-102", title: "Import organization master data" },
  }),
  createTicket({
    id: "zoom-103",
    status: "Accepted",
    assignee: "Alissia",
    subtaskCount: 2,
    ref: {
      displayId: "NEX-103",
      title: "Web: share organization folders with subfolders and content",
    },
  }),
  createTicket({
    id: "zoom-104",
    status: "In Progress",
    priority: "High",
    assignee: "Ada Lovelace",
    subtaskCount: 4,
    ref: {
      displayId: "NEX-104",
      title: "Refactor the checkout flow so card and wallet paths share one state machine",
    },
  }),
  createTicket({
    id: "zoom-105",
    status: "In Progress",
    priority: "Low",
    ref: { displayId: "NEX-105", title: "Bump deps" },
  }),
  createTicket({
    id: "zoom-106",
    status: "Code Review",
    priority: "Critical",
    assignee: "Benjamin",
    subtaskCount: 3,
    ref: { displayId: "NEX-106", title: "Semantic zoom for the My Work board" },
  }),
  createTicket({
    id: "zoom-107",
    status: "In Test",
    ref: { displayId: "NEX-107", title: "Fix the login redirect on mobile Safari" },
  }),
];

function kanbanZoomFixtureColumns() {
  return buildProjectTicketKanbanColumns(kanbanZoomFixtureTickets, {
    boardColumns: projectDashboardKanbanMatrixFixtureBoardColumns,
  });
}

function KanbanZoomFixtureView({
  level,
  onLevelChange,
}: {
  level: KanbanZoomLevel;
  onLevelChange?: (level: KanbanZoomLevel) => void;
}) {
  return (
    <div className="min-h-screen bg-background px-6 py-8 text-foreground">
      <div className="mx-auto max-w-7xl space-y-4">
        <div className="max-w-2xl space-y-1">
          <h2 className="text-lg font-semibold tracking-tight">Kanban semantic zoom — {level}</h2>
          <p className="text-sm text-muted-foreground">
            Pinch / Ctrl+wheel like OS zoom (live + inertia), then soft-snap. Quiet +/- lives in the
            existing filter bar (same row as search / options) — not a dedicated chrome row.
          </p>
        </div>
        {/* Mirrors ProjectMyWorkFilterBar: search + trailing controls on one row. */}
        <div className="mb-4 flex flex-wrap items-center gap-1">
          <div className="flex h-8 w-full items-center rounded-md border border-border/80 bg-background/95 px-3 text-xs text-muted-foreground sm:w-[15rem] lg:w-[18rem]">
            Search your assigned work
          </div>
          <div className="ml-auto flex items-center gap-2">
            {onLevelChange ? (
              <ProjectDashboardKanbanZoomControl level={level} onLevelChange={onLevelChange} />
            ) : null}
            <div className="inline-flex h-8 items-center rounded-md border border-border/70 px-2.5 text-xs text-muted-foreground">
              Options
            </div>
          </div>
        </div>
        <ProjectDashboardKanban
          kanbanColumns={kanbanZoomFixtureColumns()}
          allTickets={kanbanZoomFixtureTickets}
          isHierarchyMode={false}
          parentChildGroups={buildProjectTicketHierarchy(kanbanZoomFixtureTickets)}
          projectId="storybook-project"
          kanbanZoomLevel={level}
          {...(onLevelChange ? { onKanbanZoomLevelChange: onLevelChange } : {})}
          onOpenTicket={() => undefined}
          onTicketContextMenu={() => undefined}
        />
      </div>
    </div>
  );
}

/** Story glue: the real control drives the real board live through local state. */
function InteractiveKanbanZoom() {
  const [level, setLevel] = useState<KanbanZoomLevel>("full");
  return <KanbanZoomFixtureView level={level} onLevelChange={setLevel} />;
}

const meta = {
  title: "T3Team/Project Dashboard/Kanban Zoom",
  component: KanbanZoomFixtureView,
  parameters: { layout: "fullscreen" },
  argTypes: {
    level: {
      label: "Zoom level",
      control: "select",
      options: KANBAN_ZOOM_LEVELS,
    },
  },
} satisfies Meta<typeof KanbanZoomFixtureView>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Interactive: Story = {
  args: { level: "full" },
  render: () => <InteractiveKanbanZoom />,
  parameters: {
    docs: {
      description: {
        story:
          "Pinch / Ctrl+wheel tracks continuously with inertia, then soft-snaps. Quiet +/- steps one snap with the same settle spring.",
      },
    },
  },
};

export const Full: Story = {
  args: { level: "full" },
  parameters: {
    docs: {
      description: {
        story:
          "Pinned 'full': the legacy layout byte for byte — 17rem lanes, title + count lane header, status/priority chips, assignee names, 'Updated' timestamps.",
      },
    },
  },
};

export const Compact: Story = {
  args: { level: "compact" },
  parameters: {
    docs: {
      description: {
        story:
          "Pinned 'compact': 12rem lanes, smaller type but two-line titles (more of the title visible), chips dropped, assignee as avatar.",
      },
    },
  },
};

export const AtAGlance: Story = {
  args: { level: "at-a-glance" },
  parameters: {
    docs: {
      description: {
        story:
          "Pinned 'at-a-glance': 9.5rem lanes with lane names kept; cards keep the ticket key with an even smaller title + assignee avatar.",
      },
    },
  },
};
