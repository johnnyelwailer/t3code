import { createProjectBacklogTestTicket as createTicket } from "~/t3team/t3team-projectBacklogTestUtils";
import type { DigestGraph } from "~/t3team/t3team-projectMyWorkDigestPlan";
import type { ProjectTicket } from "~/t3team/t3team-types";
import {
  P,
  ago,
  digestFixtureGraph,
  iesTickets,
} from "~/t3team/t3team-projectMyWorkDigestFixtures";
import type { ProjectMyWorkDigestFixtureScenario } from "~/t3team/t3team-projectMyWorkDigestFixtureScenarios";

const child = (
  id: string,
  key: string,
  title: string,
  status: string,
  assignee?: string,
): ProjectTicket =>
  createTicket({
    id,
    projectId: P,
    issueType: "Sub-task",
    parentId: "story-rollen",
    status,
    ...(assignee ? { assignee } : {}),
    updatedAt: ago(8),
    ref: { displayId: key, title },
  });

// The product owner's real sprint card, IES-19503: one ticket of his in Code Review with two PRs,
// and the story's other subtasks around it — active, untouched, and finished.
const storyCardTickets: readonly ProjectTicket[] = [
  createTicket({
    id: "story-rollen",
    projectId: P,
    issueType: "Story",
    status: "In Progress",
    assignee: "Benjamin",
    updatedAt: ago(5),
    ref: { displayId: "IES-19503", title: "Rollen & Rechte: Ansicht Einsatzleitung" },
  }),
  child("task-rollen-fe", "IES-24571", "FE Rechteprüfung Einsatzliste", "Code Review", "Philip"),
  child("task-rollen-be", "IES-23580", "BE Rollenmodell erweitern", "In Review", "Sandra"),
  child("task-rollen-test", "IES-23579", "Testfälle Rollenmatrix", "To Do", "Angie"),
  child("task-rollen-doku", "IES-23581", "Doku Rechtekonzept", "To Do", "Benjamin"),
  child("task-rollen-api", "IES-21699", "API Rollen lesen", "Done", "Benjamin"),
  child("task-rollen-ux", "IES-21700", "UX Entwurf Rechte-Dialog", "Done", "Sandra"),
  child("task-rollen-mig", "IES-21701", "Migration Rollen-Tabelle", "Done", "Sandra"),
];

export const storyCardGraph: DigestGraph = {
  ...digestFixtureGraph,
  tickets: [...iesTickets, ...storyCardTickets],
  changeRequests: [
    ...digestFixtureGraph.changeRequests,
    {
      id: "pr-812",
      ticketId: "task-rollen-fe",
      title: "IES-24571 Rechteprüfung Einsatzliste",
      repo: "hive/ies-koordination",
      number: 812,
      state: "changes-requested",
      updatedAt: ago(3),
      reviewers: [{ name: "Sandra Meier", login: "smeier", decision: "changes-requested" }],
    },
    {
      id: "pr-813",
      ticketId: "task-rollen-fe",
      title: "IES-24571 Rechte-Guards in Routen",
      repo: "hive/ies-spital",
      number: 813,
      state: "open",
      updatedAt: ago(2),
      reviewers: [{ name: "Benjamin Roth", login: "brot" }],
    },
  ],
  dependencies: [
    // A colleague's ticket holds the viewer up: ranks first, amber.
    {
      ticketId: "task-rollen-fe",
      relation: "you-wait-on",
      other: {
        key: "IES-24410",
        title: "Auth-Claims im Token ergänzen",
        status: "In Progress",
        assignee: "Benjamin",
      },
    },
    {
      ticketId: "task-rollen-fe",
      relation: "waits-on-you",
      other: { key: "IES-24620", title: "E2E Rollen-Smoke", status: "To Do", assignee: "Angie" },
    },
    // The other half of the story that the ticket list does not carry: a pill, not a face.
    {
      ticketId: "task-rollen-fe",
      relation: "same-story",
      other: { key: "IES-23590", title: "Rechte im Mobile", status: "In Test", assignee: "Sandra" },
    },
    // On the existing Detailbereich card: Liste waits on the viewer's own endpoint ticket.
    {
      ticketId: "task-liste",
      relation: "you-wait-on",
      other: {
        key: "IES-18430",
        title: "Detail-Endpoint paginieren (BE)",
        status: "In Progress",
        assignee: "Philip",
      },
    },
  ],
};

export const storyCardAttentionScenario: ProjectMyWorkDigestFixtureScenario = {
  graph: storyCardGraph,
  arrangement: { state: "off" },
};
