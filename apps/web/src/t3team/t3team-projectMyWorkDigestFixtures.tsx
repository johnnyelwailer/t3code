import { useState } from "react";

import { createProjectBacklogTestTicket as createTicket } from "~/t3team/t3team-projectBacklogTestUtils";
import {
  ProjectMyWorkDigestHeader,
  type DigestBurndownVariant,
} from "~/t3team/t3team-ProjectMyWorkDigestHeader";
import {
  ProjectMyWorkDigestToolbar,
  type DigestArrangement,
} from "~/t3team/t3team-ProjectMyWorkDigestToolbar";
import { ProjectMyWorkDigestView } from "~/t3team/t3team-ProjectMyWorkDigestView";
import {
  ProjectMyWorkViewSwitch,
  type ProjectMyWorkLens,
} from "~/t3team/t3team-ProjectMyWorkViewSwitch";
import {
  buildHeuristicDigestPlan,
  resolveDigestPlan,
  type DigestGraph,
  type DigestPlan,
} from "~/t3team/t3team-projectMyWorkDigestPlan";
import type { ProjectTicket } from "~/t3team/t3team-types";

export const DIGEST_FIXTURE_NOW_MS = Date.UTC(2026, 8, 14, 9, 30);
const HOUR = 60 * 60 * 1000;
const ago = (hours: number) => new Date(DIGEST_FIXTURE_NOW_MS - hours * HOUR).toISOString();

const viewer = { name: "Philip", role: "Product Owner", lastVisitAt: ago(18) };
const IES = { id: "project-ies", name: "IES NG", url: "https://jira.example.at/IES" };
const NXAI = { id: "project-nxai", name: "Nexi AI", url: "https://jira.example.at/NXAI" };
const P = IES.id;
const threadUrl = (id: string) => `https://t3.codes/thread/${id}`;

const iesTickets: readonly ProjectTicket[] = [
  createTicket({
    id: "epic-transport",
    projectId: P,
    issueType: "Epic",
    status: "In Progress",
    assignee: "Benjamin",
    updatedAt: ago(30),
    ref: {
      displayId: "IES-9242",
      title: "312 Teil 1 Ereignisressourcen und Leistungen bewirtschaften",
    },
  }),
  createTicket({
    id: "story-detail",
    projectId: P,
    issueType: "Story",
    parentId: "epic-transport",
    status: "In Progress",
    assignee: "Philip",
    priority: "High",
    updatedAt: ago(2),
    ref: { displayId: "IES-13068", title: "EdO Transport: Detailbereich" },
  }),
  createTicket({
    id: "task-liste",
    projectId: P,
    issueType: "Task",
    parentId: "story-detail",
    status: "Code Review",
    assignee: "Philip",
    updatedAt: ago(1),
    ref: { displayId: "IES-18425", title: "Update Liste (FE)" },
  }),
  createTicket({
    id: "task-formular",
    projectId: P,
    issueType: "Task",
    parentId: "story-detail",
    status: "In Progress",
    assignee: "Philip",
    updatedAt: ago(5),
    ref: { displayId: "IES-18419", title: "Update Formular (FE)" },
  }),
  createTicket({
    id: "task-api",
    projectId: P,
    issueType: "Task",
    parentId: "story-detail",
    status: "In Progress",
    assignee: "Philip",
    updatedAt: ago(7),
    ref: { displayId: "IES-18430", title: "Detail-Endpoint paginieren (BE)" },
  }),
  createTicket({
    id: "task-detail-ui",
    projectId: P,
    issueType: "Task",
    parentId: "story-detail",
    status: "Done",
    assignee: "Benjamin",
    updatedAt: ago(20),
    ref: { displayId: "IES-18431", title: "Detailbereich UI nachziehen (FE)" },
  }),
  createTicket({
    id: "task-detail-perf",
    projectId: P,
    issueType: "Task",
    parentId: "story-detail",
    status: "To Do",
    assignee: "Angie",
    updatedAt: ago(40),
    ref: { displayId: "IES-18432", title: "Detailbereich Performance messen" },
  }),
  createTicket({
    id: "story-leistungsadmin",
    projectId: P,
    issueType: "Story",
    parentId: "epic-transport",
    status: "In Test",
    assignee: "Philip",
    updatedAt: ago(4),
    ref: { displayId: "IES-18234", title: "Leistungsadmin: Anzeige Leistungen anpassen" },
  }),
  createTicket({
    id: "task-la-fe",
    projectId: P,
    issueType: "Task",
    parentId: "story-leistungsadmin",
    status: "In Progress",
    assignee: "Philip",
    updatedAt: ago(9),
    ref: { displayId: "IES-18240", title: "FE Leistungsliste Spalten" },
  }),
  createTicket({
    id: "task-la-test",
    projectId: P,
    issueType: "Task",
    parentId: "story-leistungsadmin",
    status: "To Do",
    assignee: "Angie",
    updatedAt: ago(12),
    ref: { displayId: "IES-18241", title: "Testfälle Rundung" },
  }),
  createTicket({
    id: "story-pflicht",
    projectId: P,
    issueType: "Story",
    status: "In Progress",
    assignee: "Philip",
    updatedAt: ago(3),
    ref: { displayId: "IES-20032", title: "Web: Ergänzung Anzeige Pflichtfelder" },
  }),
  createTicket({
    id: "task-pf-notif",
    projectId: P,
    issueType: "Task",
    parentId: "story-pflicht",
    status: "In Progress",
    assignee: "Philip",
    updatedAt: ago(3),
    ref: { displayId: "IES-23721", title: "FE notifications, reporting, alarm, connect" },
  }),
  createTicket({
    id: "task-pf-user",
    projectId: P,
    issueType: "Task",
    parentId: "story-pflicht",
    status: "In Progress",
    assignee: "Benjamin",
    updatedAt: ago(6),
    ref: { displayId: "IES-23720", title: "FE Usermgmt, Sanitaet, Stammdaten" },
  }),
  createTicket({
    id: "task-pf-admin",
    projectId: P,
    issueType: "Task",
    parentId: "story-pflicht",
    status: "Done",
    assignee: "Sandra",
    updatedAt: ago(15),
    ref: { displayId: "IES-23722", title: "FE Adminbereich Pflichtfelder" },
  }),
  createTicket({
    id: "bug-unterordner",
    projectId: P,
    issueType: "Bug",
    status: "In Progress",
    assignee: "Philip",
    reporter: "Angie",
    priority: "Highest",
    updatedAt: ago(90),
    ref: {
      displayId: "IES-19748",
      title: "Freigegebener Unterordner erscheint im Root statt in Ordnerstruktur",
    },
  }),
  createTicket({
    id: "story-freigeben",
    projectId: P,
    issueType: "Story",
    status: "Accepted",
    assignee: "Philip",
    updatedAt: ago(70),
    ref: { displayId: "IES-15017", title: "Web: Dateien Freigeben (Organisationsablage)" },
  }),
  createTicket({
    id: "story-import",
    projectId: P,
    issueType: "Story",
    status: "To Do",
    assignee: "Philip",
    updatedAt: ago(200),
    ref: { displayId: "IES-17877", title: "Stammdaten der Organisation importieren" },
  }),
  createTicket({
    id: "task-passkey",
    projectId: P,
    issueType: "Task",
    status: "To Do",
    assignee: "Philip",
    updatedAt: ago(140),
    ref: { displayId: "IES-20110", title: "Portal-Login: Passkey-Registrierung nachziehen" },
  }),
  createTicket({
    id: "bug-gis",
    projectId: P,
    issueType: "Bug",
    status: "To Do",
    assignee: "Philip",
    reporter: "Sandra",
    updatedAt: ago(160),
    ref: {
      displayId: "IES-23940",
      title: "GIS-Map Sperrungen Layers nicht automatisch als selektierter Layer",
    },
  }),
  createTicket({
    id: "story-done",
    projectId: P,
    issueType: "Story",
    status: "Done",
    assignee: "Philip",
    updatedAt: ago(26),
    ref: { displayId: "IES-19001", title: "Sprint-Board: Filter nach Verantwortlichem" },
  }),
];

const nxaiTickets: readonly ProjectTicket[] = [
  createTicket({
    id: "nx-epic-roles",
    projectId: NXAI.id,
    issueType: "Epic",
    status: "In Progress",
    assignee: "Philip",
    updatedAt: ago(40),
    ref: { displayId: "NXAI-6", title: "Rollendefinitionen" },
  }),
  createTicket({
    id: "nx-dev-role",
    projectId: NXAI.id,
    issueType: "Story",
    parentId: "nx-epic-roles",
    status: "In Analysis",
    assignee: "Philip",
    updatedAt: ago(8),
    ref: { displayId: "NXAI-8", title: "Dev-Rolle" },
  }),
  createTicket({
    id: "nx-digest",
    projectId: NXAI.id,
    issueType: "Story",
    status: "In Progress",
    assignee: "Philip",
    updatedAt: ago(0.5),
    ref: { displayId: "NXAI-480", title: "Work coordination: above the 100-chat problem" },
  }),
  createTicket({
    id: "nx-composer",
    projectId: NXAI.id,
    issueType: "Story",
    status: "In Progress",
    assignee: "Philip",
    updatedAt: ago(50),
    ref: { displayId: "TEB-40", title: "Cursor Composer" },
  }),
];

const iesGraphWithoutSprint: DigestGraph = {
  scope: "project",
  projects: [IES],
  viewer,
  tickets: iesTickets,
  claims: [
    // task-liste carries three concurrent agents: one fresh, one idle, one stale.
    {
      threadId: "thr-liste",
      threadTitle: "IES-18425 Liste FE umsetzen",
      ticketId: "task-liste",
      agent: "Nexplore AI",
      lastActivityAt: ago(0.5),
      threadUrl: threadUrl("thr-liste"),
    },
    {
      threadId: "thr-liste-2",
      threadTitle: "IES-18425 Liste: Tests nachziehen",
      ticketId: "task-liste",
      agent: "GPT Luna",
      lastActivityAt: ago(6),
      threadUrl: threadUrl("thr-liste-2"),
    },
    {
      threadId: "thr-liste-3",
      threadTitle: "IES-18425 Liste: Spike Migration",
      ticketId: "task-liste",
      agent: "Claude Opus",
      lastActivityAt: ago(96),
      threadUrl: threadUrl("thr-liste-3"),
    },
    {
      threadId: "thr-formular",
      threadTitle: "IES-18419 Formular nachziehen",
      ticketId: "task-formular",
      agent: "GPT Luna",
      lastActivityAt: ago(6),
      threadUrl: threadUrl("thr-formular"),
    },
    {
      threadId: "thr-api",
      threadTitle: "IES-18430 Pagination",
      ticketId: "task-api",
      agent: "Nexplore AI",
      lastActivityAt: ago(2),
      threadUrl: threadUrl("thr-api"),
    },
    {
      threadId: "thr-la-fe",
      threadTitle: "IES-18240 Spalten",
      ticketId: "task-la-fe",
      agent: "Nexplore AI",
      lastActivityAt: ago(10),
      threadUrl: threadUrl("thr-la-fe"),
    },
    {
      threadId: "thr-la",
      threadTitle: "IES-18234 Rundung klären",
      ticketId: "story-leistungsadmin",
      agent: "GPT Luna",
      lastActivityAt: ago(20),
      threadUrl: threadUrl("thr-la"),
    },
    {
      threadId: "thr-pf-notif",
      threadTitle: "IES-23721 Validate forms",
      ticketId: "task-pf-notif",
      agent: "Nexplore AI",
      lastActivityAt: ago(1.5),
      threadUrl: threadUrl("thr-pf-notif"),
    },
    {
      threadId: "thr-pf-user",
      threadTitle: "IES-23720 Validate forms",
      ticketId: "task-pf-user",
      agent: "GPT Luna",
      lastActivityAt: ago(4),
      threadUrl: threadUrl("thr-pf-user"),
    },
    {
      threadId: "thr-unterordner",
      threadTitle: "Root-Ordner Bug eingrenzen",
      ticketId: "bug-unterordner",
      agent: "Nexplore AI",
      lastActivityAt: ago(96),
      threadUrl: threadUrl("thr-unterordner"),
    },
    {
      threadId: "thr-freigeben",
      threadTitle: "Freigabe-Dialog Spike",
      ticketId: "story-freigeben",
      agent: "Claude Opus",
      lastActivityAt: ago(80),
      threadUrl: threadUrl("thr-freigeben"),
    },
  ],
  decisions: [
    {
      id: "dec-1",
      ticketId: "task-formular",
      threadId: "thr-formular",
      requiredRole: "Product Owner",
      askedAt: ago(3),
      question: "Kostenstelle auch für Rückbuchungen Pflicht?",
    },
    {
      id: "dec-2",
      ticketId: "story-leistungsadmin",
      threadId: "thr-la",
      requiredRole: "Product Owner",
      askedAt: ago(20),
      question: "Testfall 4: Rundung – Anforderung oder Bug?",
    },
  ],
  changeRequests: [
    {
      id: "pr-762",
      ticketId: "task-liste",
      repo: "hive/ies-koordination",
      number: 762,
      state: "needs-you",
      updatedAt: ago(1),
      reviewers: [
        { name: "Benjamin Roth", login: "brot" },
        { name: "Sara Klein", login: "sklein" },
      ],
    },
    {
      id: "pr-64",
      ticketId: "story-detail",
      repo: "hive/ies-spital",
      number: 64,
      state: "changes-requested",
      updatedAt: ago(28),
      reviewers: [{ name: "Benjamin Roth", login: "brot", decision: "changes-requested" }],
    },
    {
      id: "pr-331",
      ticketId: "task-formular",
      repo: "hive/ies-koordination",
      number: 331,
      state: "draft",
      updatedAt: ago(3),
      reviewers: [],
    },
    {
      id: "pr-312",
      ticketId: "task-la-fe",
      repo: "hive/ies-base-ui",
      number: 312,
      state: "ci-failing",
      updatedAt: ago(2),
      reviewers: [{ name: "Marcus Weber", login: "mweber" }],
    },
    {
      id: "pr-262",
      ticketId: "task-pf-notif",
      repo: "hive/ies-base-notifications",
      number: 262,
      state: "open",
      updatedAt: ago(5),
      reviewers: [{ name: "Marcus Weber", login: "mweber" }],
      unhandledComments: 2,
    },
    {
      id: "pr-320",
      ticketId: "task-pf-notif",
      repo: "hive/ies-alarm",
      number: 320,
      state: "open",
      updatedAt: ago(5),
      reviewers: [{ name: "Sara Klein", login: "sklein" }],
    },
    {
      id: "pr-323",
      ticketId: "task-pf-user",
      repo: "hive/ies-base-uicomponents",
      number: 323,
      state: "approved",
      updatedAt: ago(2),
      reviewers: [{ name: "Sara Klein", login: "sklein", decision: "approved" }],
    },
    {
      id: "pr-750",
      ticketId: "story-done",
      repo: "hive/ies-koordination",
      number: 750,
      state: "merged",
      updatedAt: ago(26),
      reviewers: [{ name: "Benjamin Roth", login: "brot", decision: "approved" }],
    },
  ],
  transitions: [
    { ticketId: "task-liste", from: "In Progress", to: "Code Review", at: ago(1) },
    { ticketId: "story-leistungsadmin", from: "Code Review", to: "In Test", at: ago(4) },
    { ticketId: "story-done", from: "In Test", to: "Done", at: ago(26) },
  ],
  blockers: [{ ticketId: "task-api", repo: "hive/ies-koordination", number: 755 }],
};

export const digestFixtureGraph: DigestGraph = {
  ...iesGraphWithoutSprint,
  sprint: {
    name: "PW Sprint 8.5",
    goal: [
      "Ready für FAT, möglichst viele Bugs gefixt",
      "Deep-Link aus PI-5 sichtbar",
      "PSD kann den Mobile Absprung nutzen",
    ],
    startDate: "2026-09-03T00:00:00.000Z",
    endDate: "2026-09-23T00:00:00.000Z",
  },
};

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

function withGraphChanges(graph: DigestGraph): DigestGraph {
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

export function ProjectMyWorkDigestFixtureView({
  scenario,
  nowOffsetHours = 0,
  burndownVariant = "off",
  inAppOpen = false,
}: {
  scenario: ProjectMyWorkDigestFixtureScenario;
  nowOffsetHours?: number;
  burndownVariant?: DigestBurndownVariant;
  /** Demo flag: routes row clicks through an onOpenTicket handler instead of window.open. */
  inAppOpen?: boolean;
}) {
  const [lens, setLens] = useState<ProjectMyWorkLens>("digest");
  const [arrangement, setArrangement] = useState<DigestArrangement>(scenario.arrangement);
  const [openTicket, setOpenTicket] = useState<string | null>(null);
  const nowMs = DIGEST_FIXTURE_NOW_MS + nowOffsetHours * HOUR;
  const onOpenTicket = inAppOpen
    ? (ticketId: string) => {
        setOpenTicket(ticketId);
        window.setTimeout(() => setOpenTicket(null), 1600);
      }
    : undefined;
  const basePlan =
    arrangement.state === "live" || arrangement.state === "paused"
      ? arrangement.plan
      : buildHeuristicDigestPlan(scenario.graph, nowMs);
  const plan = resolveDigestPlan(basePlan, scenario.graph, nowMs);
  const start = () => {
    setArrangement({ state: "starting" });
    window.setTimeout(
      () =>
        setArrangement({
          state: "live",
          plan: { ...digestFixtureAgentPlan, producedAt: new Date(nowMs).toISOString() },
          refreshing: false,
        }),
      1200,
    );
  };
  return (
    <div className="min-h-screen bg-background px-4 py-5 text-foreground sm:px-6 sm:py-7 xl:px-10 2xl:px-14">
      <div className="mx-auto w-full space-y-5 sm:space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
          <ProjectMyWorkViewSwitch lens={lens} onLensChange={setLens} />
          {lens === "digest" ? (
            <ProjectMyWorkDigestToolbar
              arrangement={arrangement}
              newSinceCount={plan.newSinceTicketIds.length}
              nowMs={nowMs}
              graphEmpty={scenario.graph.tickets.length === 0}
              onStart={start}
              onPause={() =>
                setArrangement((c) => (c.state === "live" ? { state: "paused", plan: c.plan } : c))
              }
              onResume={() =>
                setArrangement((c) =>
                  c.state === "paused" ? { state: "live", plan: c.plan, refreshing: false } : c,
                )
              }
            />
          ) : null}
        </div>
        {lens === "digest" ? (
          <>
            <ProjectMyWorkDigestHeader
              graph={scenario.graph}
              nowMs={nowMs}
              burndownVariant={burndownVariant}
            />
            <ProjectMyWorkDigestView
              plan={plan}
              graph={scenario.graph}
              nowMs={nowMs}
              onOpenTicket={onOpenTicket}
            />
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            {lens === "hierarchy" ? "Hierarchy" : "Board"} lens: existing My Work view over the same
            graph.
          </p>
        )}
      </div>
      {openTicket ? (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background shadow-lg">
          demo: onOpenTicket("{openTicket}")
        </div>
      ) : null}
    </div>
  );
}
