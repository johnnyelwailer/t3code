import { createProjectBacklogTestTicket as createTicket } from "~/t3team/t3team-projectBacklogTestUtils";
import type { DigestArrangement } from "~/t3team/t3team-ProjectMyWorkDigestToolbar";
import type { DigestGraph, DigestPlan } from "~/t3team/t3team-projectMyWorkDigestPlan";
import type { ProjectTicket } from "~/t3team/t3team-types";
import {
  IES,
  P,
  ago,
  digestFixtureGraph,
  viewer,
} from "~/t3team/t3team-projectMyWorkDigestFixtures";

export const digestFixtureAgentPlan: DigestPlan = {
  producer: "agent",
  producedAt: ago(2),
  sections: [
    {
      id: "unblock",
      kind: "items",
      placement: "side",
      heading: "Two answers unblock three agents",
      items: [
        { ticketId: "task-formular", why: "GPT Luna is waiting on the Kostenstelle rule." },
        { ticketId: "story-leistungsadmin", why: "Test blocked since yesterday." },
      ],
    },
    {
      id: "review-chain",
      kind: "items",
      placement: "side",
      heading: "Review first",
      hint: "#762 is the parent of the #64 fix.",
      items: [
        { ticketId: "task-liste" },
        { ticketId: "story-detail", why: "Sitting 28 h, nobody picked it up." },
      ],
    },
    {
      id: "order",
      kind: "items",
      placement: "main",
      heading: "Priority",
      items: [
        { ticketId: "task-api" },
        { ticketId: "task-la-fe" },
        { ticketId: "task-la-test" },
        { ticketId: "task-pf-notif", why: "4 PRs waiting on reviewers." },
        { ticketId: "task-pf-user" },
        { ticketId: "bug-gis" },
      ],
    },
    {
      id: "cold",
      kind: "items",
      placement: "footer",
      heading: "Cold agent threads",
      hint: "silent > 3 d · nudge or release",
      items: [{ ticketId: "bug-unterordner" }, { ticketId: "story-freigeben" }],
    },
    {
      id: "parked",
      kind: "items",
      placement: "footer",
      heading: "Parked",
      hint: "nothing needed from you",
      items: [{ ticketId: "story-import" }, { ticketId: "task-passkey" }],
    },
  ],
};

export function withGraphChanges(graph: DigestGraph): DigestGraph {
  const closed = new Set(["story-freigeben", "task-passkey"]);
  const added: readonly ProjectTicket[] = [
    createTicket({
      id: "bug-neu",
      projectId: P,
      issueType: "Bug",
      status: "To Do",
      assignee: "Philip",
      reporter: "Angie",
      priority: "High",
      updatedAt: ago(0.3),
      ref: { displayId: "IES-20231", title: "Export CSV: Umlaute falsch kodiert" },
    }),
    createTicket({
      id: "task-neu",
      projectId: P,
      issueType: "Task",
      status: "In Progress",
      assignee: "Philip",
      updatedAt: ago(0.2),
      ref: { displayId: "IES-20232", title: "Release Notes 2026.9 vorbereiten" },
    }),
  ];
  return {
    ...graph,
    tickets: [
      ...graph.tickets.map((t) =>
        closed.has(t.id) ? { ...t, status: "Done", updatedAt: ago(0.4) } : t,
      ),
      ...added,
    ],
    claims: [
      ...graph.claims,
      {
        threadId: "thr-neu",
        threadTitle: "Release Notes entwerfen",
        ticketId: "task-neu",
        agent: "Nexplore AI",
        lastActivityAt: ago(0.1),
      },
    ],
  };
}

export type ProjectMyWorkDigestFixtureScenario = {
  readonly graph: DigestGraph;
  readonly arrangement: DigestArrangement;
};

const emptyGraph: DigestGraph = {
  scope: "project",
  projects: [IES],
  viewer,
  tickets: [],
  claims: [],
  decisions: [],
  changeRequests: [],
  transitions: [],
  blockers: [],
};

export const emptyGraphScenario: ProjectMyWorkDigestFixtureScenario = {
  graph: emptyGraph,
  arrangement: { state: "off" },
};
export const heuristicArrangementScenario: ProjectMyWorkDigestFixtureScenario = {
  graph: digestFixtureGraph,
  arrangement: { state: "off" },
};
export const agentArrangementScenario: ProjectMyWorkDigestFixtureScenario = {
  graph: digestFixtureGraph,
  arrangement: { state: "live", plan: digestFixtureAgentPlan, refreshing: false },
};
export const agentArrangementRefreshScenario: ProjectMyWorkDigestFixtureScenario = {
  graph: withGraphChanges(digestFixtureGraph),
  arrangement: { state: "live", plan: digestFixtureAgentPlan, refreshing: true },
};
export const pausedArrangementScenario: ProjectMyWorkDigestFixtureScenario = {
  graph: withGraphChanges(digestFixtureGraph),
  arrangement: { state: "paused", plan: digestFixtureAgentPlan },
};
export const errorArrangementScenario: ProjectMyWorkDigestFixtureScenario = {
  graph: digestFixtureGraph,
  arrangement: { state: "error", message: "Recipe run exceeded budget" },
};
