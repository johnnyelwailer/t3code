import type { Meta, StoryObj } from "@storybook/react";
import { useMemo, useState } from "react";

import { ProjectBacklogTableView } from "~/t3team/t3team-ProjectBacklogTableView";
import { buildVisibleBacklogHierarchy } from "~/t3team/t3team-projectBacklogPresentation";
import type {
  ProjectBacklogTableColumnId,
  ProjectBacklogTableGroupBy,
  ProjectBacklogTableSortBy,
  ProjectBacklogTableSortDirection,
} from "~/t3team/t3team-projectBacklogTable";
import { createProjectBacklogTestTicket } from "~/t3team/t3team-projectBacklogTestUtils";
import type { ProjectTicket } from "~/t3team/t3team-types";

const STATUSES = ["To Do", "In Progress", "In Review", "In Test", "Done"] as const;
const ASSIGNEES = ["Ada Lovelace", "Grace Hopper", "Alan Kay", "Barbara Liskov", undefined];

/** A sprint-sized backlog: epics → stories → subtasks, roughly the shape of a real team board. */
function buildBacklogFixtureTickets(epicCount: number): ProjectTicket[] {
  const tickets: ProjectTicket[] = [];
  let counter = 1;
  for (let epicIndex = 0; epicIndex < epicCount; epicIndex += 1) {
    const epicId = `DEMO-${counter++}`;
    tickets.push(
      createProjectBacklogTestTicket({
        id: epicId,
        issueType: "Epic",
        status: "In Progress",
        ref: { title: `Epic ${epicIndex + 1}: patient journey increment`, type: "Epic" },
      }),
    );
    for (let storyIndex = 0; storyIndex < 4; storyIndex += 1) {
      const storyId = `DEMO-${counter++}`;
      const assignee = ASSIGNEES[storyIndex];
      tickets.push(
        createProjectBacklogTestTicket({
          id: storyId,
          parentId: epicId,
          issueType: "Story",
          status: STATUSES[(epicIndex + storyIndex) % STATUSES.length]!,
          estimateValue: (storyIndex % 3) + 2,
          subtaskCount: 2,
          sprintId: "8",
          sprintName: "Sprint 8.6",
          sprintState: "future",
          ref: { title: `Story ${storyIndex + 1} of epic ${epicIndex + 1}`, type: "Story" },
          ...(assignee ? { assignee } : {}),
        }),
      );
      for (let subtaskIndex = 0; subtaskIndex < 2; subtaskIndex += 1) {
        tickets.push(
          createProjectBacklogTestTicket({
            id: `DEMO-${counter++}`,
            parentId: storyId,
            issueType: "Sub-task",
            issueTypeIsSubtask: true,
            status: STATUSES[subtaskIndex]!,
            sprintId: "8",
            sprintName: "Sprint 8.6",
            sprintState: "future",
            ref: { title: subtaskIndex === 0 ? "Implementation" : "Testing", type: "Sub-task" },
          }),
        );
      }
    }
  }
  return tickets;
}

const VISIBLE_COLUMNS: readonly ProjectBacklogTableColumnId[] = [
  "status",
  "assignee",
  "estimate",
  "parent",
  "updated",
];

const noopAsync = async () => undefined;

function BacklogTableFixture({
  epicCount,
  groupBy,
}: {
  epicCount: number;
  groupBy: ProjectBacklogTableGroupBy;
}) {
  const tickets = useMemo(() => buildBacklogFixtureTickets(epicCount), [epicCount]);
  const { contextByTicketId } = useMemo(
    () => buildVisibleBacklogHierarchy(tickets, tickets),
    [tickets],
  );
  const [sortBy, setSortBy] = useState<ProjectBacklogTableSortBy>("rank");
  const [sortDirection, setSortDirection] = useState<ProjectBacklogTableSortDirection>("asc");

  return (
    <div className="flex h-[640px] flex-col">
      <ProjectBacklogTableView
        projectId="project-1"
        tickets={tickets}
        contextByTicketId={contextByTicketId}
        groupBy={groupBy}
        sortBy={sortBy}
        sortDirection={sortDirection}
        visibleColumns={VISIBLE_COLUMNS}
        collapseGroupsRequestKey={0}
        expandGroupsRequestKey={0}
        estimateFieldLabel="Story Points"
        canCreateSubtasks
        onTicketContextMenu={() => undefined}
        getTicketAgentContext={() => null}
        onOpenTicket={() => undefined}
        onSearchAssignableUsers={async () => []}
        onUpdateAssignee={noopAsync}
        onUpdateEstimate={noopAsync}
        onCreateSubtask={noopAsync}
        onSortByChange={setSortBy}
        onSortDirectionChange={setSortDirection}
      />
    </div>
  );
}

const meta = {
  title: "T3Team/Backlog/Table",
  component: BacklogTableFixture,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof BacklogTableFixture>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SprintSized: Story = { args: { epicCount: 40, groupBy: "none" } };

export const GroupedByStatus: Story = { args: { epicCount: 40, groupBy: "status" } };
