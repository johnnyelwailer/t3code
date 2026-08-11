import { createProjectBacklogTestTicket as createTicket } from "~/t3team/t3team-projectBacklogTestUtils";
import { ProjectDashboardKanban } from "~/t3team/t3team-ProjectDashboardKanban";
import {
  buildProjectTicketKanbanColumns,
  type ProjectTicketKanbanBoardColumn,
} from "~/t3team/t3team-projectTicketStatus";
import { buildProjectTicketHierarchy } from "~/t3team/t3team-ticketHierarchy";
import type { ProjectTicket } from "~/t3team/t3team-types";

export const projectDashboardKanbanMatrixFixtureBoardColumns: ReadonlyArray<ProjectTicketKanbanBoardColumn> =
  [
    { name: "To Do", statuses: [{ name: "To Do" }, { name: "Open" }] },
    { name: "Accepted", statuses: [{ name: "Accepted" }] },
    { name: "In Progress", statuses: [{ name: "In Progress" }] },
    { name: "Code Review", statuses: [{ name: "Code Review" }] },
    { name: "In Test", statuses: [{ name: "In Test" }] },
  ];

export type ProjectDashboardKanbanMatrixFixtureScenario = {
  readonly title: string;
  readonly description: string;
  readonly tickets: readonly ProjectTicket[];
};

export const nestedEpicStorySubtaskScenario: ProjectDashboardKanbanMatrixFixtureScenario = {
  title: "Nested epic/story/subtask",
  description:
    "Epic spans across stories while nested subtasks move across accepted, in progress, review, and test lanes.",
  tickets: [
    createTicket({
      id: "epic-org",
      issueType: "Epic",
      status: "In Progress",
      assignee: "Benjamin",
      ref: {
        displayId: "IES-9242",
        title: "312 Teil 1 Ereignisressourcen - und Leistungen bewirtschaften",
      },
    }),
    createTicket({
      id: "story-accepted",
      issueType: "Story",
      parentId: "epic-org",
      status: "Accepted",
      assignee: "Philip",
      ref: { displayId: "IES-13068", title: "EdO Transport: Detailbereich" },
    }),
    createTicket({
      id: "subtask-progress",
      issueType: "Task",
      parentId: "story-accepted",
      status: "In Progress",
      assignee: "Philip",
      ref: { displayId: "IES-18425", title: "Update Liste (FE)" },
    }),
    createTicket({
      id: "story-progress",
      issueType: "Story",
      parentId: "epic-org",
      status: "In Progress",
      assignee: "Benjamin",
      ref: {
        displayId: "IES-18234",
        title: "Leistungsadmin: Anzeige Leistungen anpassen",
      },
    }),
    createTicket({
      id: "subtask-review",
      issueType: "Task",
      parentId: "story-progress",
      status: "Code Review",
      assignee: "Philip",
      ref: { displayId: "IES-18419", title: "Update Formular (FE)" },
    }),
    createTicket({
      id: "story-test",
      issueType: "Story",
      parentId: "epic-org",
      status: "In Test",
      assignee: "Philip",
      ref: {
        displayId: "IES-15017",
        title: "Web: Dateien Freigeben (Organisationsablage)",
      },
    }),
    createTicket({
      id: "bug-test",
      issueType: "Bug",
      parentId: "epic-org",
      status: "In Test",
      assignee: "Philip",
      ref: {
        displayId: "IES-19748",
        title: "Freigegebener Unterordner erscheint im Root statt in Ordnerstruktur",
      },
    }),
  ],
};

export const acceptedStoryTodoSubtaskScenario: ProjectDashboardKanbanMatrixFixtureScenario = {
  title: "Accepted story with To Do subtask",
  description:
    "The child sits in an earlier lane and should still get a solid enclosing segment instead of a stray divider line.",
  tickets: [
    createTicket({
      id: "epic-leftward",
      issueType: "Epic",
      status: "In Progress",
      assignee: "Michael",
      ref: { displayId: "IES-14895", title: "Datei Ablage Organisation Teil 1" },
    }),
    createTicket({
      id: "story-leftward",
      issueType: "Story",
      parentId: "epic-leftward",
      status: "Accepted",
      assignee: "Philip",
      ref: { displayId: "IES-17877", title: "Stammdaten der Organisation importieren" },
    }),
    createTicket({
      id: "subtask-todo",
      issueType: "Task",
      parentId: "story-leftward",
      status: "To Do",
      assignee: "Philip",
      ref: { displayId: "IES-20392", title: "Frontend-Review" },
    }),
    createTicket({
      id: "peer-story",
      issueType: "Story",
      parentId: "epic-leftward",
      status: "Accepted",
      assignee: "Philip",
      ref: { displayId: "IES-17878", title: "Stammdaten der Organisation exportieren" },
    }),
    createTicket({
      id: "peer-subtask",
      issueType: "Task",
      parentId: "peer-story",
      status: "To Do",
      assignee: "Philip",
      ref: { displayId: "IES-20388", title: "Frontend-Review" },
    }),
  ],
};

export const sameLaneNestedSubtasksScenario: ProjectDashboardKanbanMatrixFixtureScenario = {
  title: "Same-lane nested subgroup",
  description: "Story and subtask stay in the same lane while still nested inside an epic shell.",
  tickets: [
    createTicket({
      id: "epic-same-lane",
      issueType: "Epic",
      status: "In Progress",
      assignee: "Michael",
      ref: { displayId: "IES-15362", title: "Datei Ablage Teil 3" },
    }),
    createTicket({
      id: "story-same-lane",
      issueType: "Story",
      parentId: "epic-same-lane",
      status: "In Progress",
      assignee: "Philip",
      ref: {
        displayId: "IES-16645",
        title: "Web: Ordner freigeben (Organisationsablage)",
      },
    }),
    createTicket({
      id: "subtask-same-lane",
      issueType: "Task",
      parentId: "story-same-lane",
      status: "In Progress",
      assignee: "Philip",
      ref: {
        displayId: "IES-19810",
        title: "Anforderung: Ordnerfreigabe rekursiv auf Unterordner und Inhalte",
      },
    }),
    createTicket({
      id: "todo-child",
      issueType: "Bug",
      parentId: "epic-same-lane",
      status: "To Do",
      assignee: "Alissia",
      ref: {
        displayId: "IES-17863",
        title: "Web Detailansicht Eign Leistungsanfrage",
      },
    }),
    createTicket({
      id: "todo-subtask",
      issueType: "Task",
      parentId: "todo-child",
      status: "To Do",
      assignee: "Philip",
      ref: { displayId: "IES-19739", title: "Review" },
    }),
  ],
};

export function ProjectDashboardKanbanMatrixFixtureView({
  scenario,
}: {
  scenario: ProjectDashboardKanbanMatrixFixtureScenario;
}) {
  const kanbanColumns = buildProjectTicketKanbanColumns(scenario.tickets, {
    boardColumns: projectDashboardKanbanMatrixFixtureBoardColumns,
  });
  const parentChildGroups = buildProjectTicketHierarchy(scenario.tickets);

  return (
    <div className="min-h-screen bg-background px-6 py-8 text-foreground">
      <div className="mx-auto max-w-7xl space-y-4">
        <div className="max-w-3xl space-y-1">
          <h2 className="text-lg font-semibold tracking-tight">{scenario.title}</h2>
          <p className="text-sm text-muted-foreground">{scenario.description}</p>
        </div>
        <ProjectDashboardKanban
          kanbanColumns={kanbanColumns}
          allTickets={scenario.tickets}
          isHierarchyMode
          parentChildGroups={parentChildGroups}
          projectId="storybook-project"
          onOpenTicket={() => undefined}
          onTicketContextMenu={() => undefined}
        />
      </div>
    </div>
  );
}
