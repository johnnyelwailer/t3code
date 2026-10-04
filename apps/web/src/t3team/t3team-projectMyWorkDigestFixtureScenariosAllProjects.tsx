import type { DigestGraph } from "~/t3team/t3team-projectMyWorkDigestPlan";
import {
  IES,
  NXAI,
  ago,
  digestFixtureGraph,
  iesGraphWithoutSprint,
  iesTickets,
  nxaiTickets,
  threadUrl,
} from "~/t3team/t3team-projectMyWorkDigestFixtures";
import {
  digestFixtureAgentPlan,
  type ProjectMyWorkDigestFixtureScenario,
} from "~/t3team/t3team-projectMyWorkDigestFixtureScenarios";

const allProjectsGraph: DigestGraph = {
  ...iesGraphWithoutSprint,
  scope: "all",
  projects: [IES, NXAI],
  tickets: [...iesTickets, ...nxaiTickets],
  claims: [
    ...digestFixtureGraph.claims,
    {
      threadId: "thr-nx-digest",
      threadTitle: "Work Coordination View Modes",
      ticketId: "nx-digest",
      agent: "Claude Fable",
      lastActivityAt: ago(0.2),
      threadUrl: threadUrl("thr-nx-digest"),
    },
    {
      threadId: "thr-nx-role",
      threadTitle: "NXAI-8 Dev-Rolle klären",
      ticketId: "nx-dev-role",
      agent: "GPT Luna",
      lastActivityAt: ago(30),
      threadUrl: threadUrl("thr-nx-role"),
    },
  ],
  decisions: [
    ...digestFixtureGraph.decisions,
    {
      id: "dec-nx",
      ticketId: "nx-dev-role",
      threadId: "thr-nx-role",
      requiredRole: "Product Owner",
      askedAt: ago(30),
      question: "Dev-Rolle: darf sie Recipes publizieren?",
    },
  ],
};

export const allProjectsHeuristicScenario: ProjectMyWorkDigestFixtureScenario = {
  graph: allProjectsGraph,
  arrangement: { state: "off" },
};
export const allProjectsAgentScenario: ProjectMyWorkDigestFixtureScenario = {
  graph: allProjectsGraph,
  arrangement: {
    state: "live",
    refreshing: false,
    plan: {
      ...digestFixtureAgentPlan,
      sections: [
        {
          id: "unblock",
          kind: "items",
          placement: "side",
          heading: "Three answers, two projects",
          items: [
            { ticketId: "task-formular" },
            { ticketId: "story-leistungsadmin" },
            { ticketId: "nx-dev-role", why: "Blocks the role epic for two weeks now." },
          ],
        },
        ...digestFixtureAgentPlan.sections.slice(1, 2),
        {
          id: "order",
          kind: "items",
          placement: "main",
          heading: "Priority",
          items: [
            { ticketId: "nx-digest", why: "Live exploration thread, answer while it is warm." },
            { ticketId: "task-api" },
            { ticketId: "task-la-fe" },
            { ticketId: "task-pf-notif" },
            { ticketId: "task-pf-user" },
            { ticketId: "nx-composer" },
          ],
        },
        ...digestFixtureAgentPlan.sections.slice(3),
      ],
    },
  },
};
