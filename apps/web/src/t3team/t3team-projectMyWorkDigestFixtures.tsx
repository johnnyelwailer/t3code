import { useState } from "react";

import { createProjectBacklogTestTicket as createTicket } from "~/t3team/t3team-projectBacklogTestUtils";
import { ProjectMyWorkDigestHeader } from "~/t3team/t3team-ProjectMyWorkDigestHeader";
import { ProjectMyWorkDigestToolbar, type DigestArrangement } from "~/t3team/t3team-ProjectMyWorkDigestToolbar";
import { ProjectMyWorkDigestView } from "~/t3team/t3team-ProjectMyWorkDigestView";
import type { ProjectMyWorkLens } from "~/t3team/t3team-ProjectMyWorkViewSwitch";
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
const IES = { id: "project-ies", name: "IES NG" };
const NXAI = { id: "project-nxai", name: "Nexi AI" };
const P = IES.id;

const iesTickets: readonly ProjectTicket[] = [
  createTicket({ id: "epic-transport", projectId: P, issueType: "Epic", status: "In Progress", assignee: "Benjamin", updatedAt: ago(30),
    ref: { displayId: "IES-9242", title: "312 Teil 1 Ereignisressourcen und Leistungen bewirtschaften" } }),
  createTicket({ id: "story-detail", projectId: P, issueType: "Story", parentId: "epic-transport", status: "In Progress", assignee: "Philip", priority: "High", updatedAt: ago(2),
    ref: { displayId: "IES-13068", title: "EdO Transport: Detailbereich" } }),
  createTicket({ id: "task-liste", projectId: P, issueType: "Task", parentId: "story-detail", status: "Code Review", assignee: "Philip", updatedAt: ago(1),
    ref: { displayId: "IES-18425", title: "Update Liste (FE)" } }),
  createTicket({ id: "task-formular", projectId: P, issueType: "Task", parentId: "story-detail", status: "In Progress", assignee: "Philip", updatedAt: ago(5),
    ref: { displayId: "IES-18419", title: "Update Formular (FE)" } }),
  createTicket({ id: "task-api", projectId: P, issueType: "Task", parentId: "story-detail", status: "In Progress", assignee: "Philip", updatedAt: ago(7),
    ref: { displayId: "IES-18430", title: "Detail-Endpoint paginieren (BE)" } }),
  createTicket({ id: "story-leistungsadmin", projectId: P, issueType: "Story", parentId: "epic-transport", status: "In Test", assignee: "Philip", updatedAt: ago(4),
    ref: { displayId: "IES-18234", title: "Leistungsadmin: Anzeige Leistungen anpassen" } }),
  createTicket({ id: "task-la-fe", projectId: P, issueType: "Task", parentId: "story-leistungsadmin", status: "In Progress", assignee: "Philip", updatedAt: ago(9),
    ref: { displayId: "IES-18240", title: "FE Leistungsliste Spalten" } }),
  createTicket({ id: "task-la-test", projectId: P, issueType: "Task", parentId: "story-leistungsadmin", status: "To Do", assignee: "Philip", updatedAt: ago(12),
    ref: { displayId: "IES-18241", title: "Testfälle Rundung" } }),
  createTicket({ id: "story-pflicht", projectId: P, issueType: "Story", status: "In Progress", assignee: "Philip", updatedAt: ago(3),
    ref: { displayId: "IES-20032", title: "Web: Ergänzung Anzeige Pflichtfelder" } }),
  createTicket({ id: "task-pf-notif", projectId: P, issueType: "Task", parentId: "story-pflicht", status: "In Progress", assignee: "Philip", updatedAt: ago(3),
    ref: { displayId: "IES-23721", title: "FE notifications, reporting, alarm, connect" } }),
  createTicket({ id: "task-pf-user", projectId: P, issueType: "Task", parentId: "story-pflicht", status: "In Progress", assignee: "Philip", updatedAt: ago(6),
    ref: { displayId: "IES-23720", title: "FE Usermgmt, Sanitaet, Stammdaten" } }),
  createTicket({ id: "bug-unterordner", projectId: P, issueType: "Bug", status: "In Progress", assignee: "Philip", priority: "Highest", updatedAt: ago(90),
    ref: { displayId: "IES-19748", title: "Freigegebener Unterordner erscheint im Root statt in Ordnerstruktur" } }),
  createTicket({ id: "story-freigeben", projectId: P, issueType: "Story", status: "Accepted", assignee: "Philip", updatedAt: ago(70),
    ref: { displayId: "IES-15017", title: "Web: Dateien Freigeben (Organisationsablage)" } }),
  createTicket({ id: "story-import", projectId: P, issueType: "Story", status: "To Do", assignee: "Philip", updatedAt: ago(200),
    ref: { displayId: "IES-17877", title: "Stammdaten der Organisation importieren" } }),
  createTicket({ id: "task-passkey", projectId: P, issueType: "Task", status: "To Do", assignee: "Philip", updatedAt: ago(140),
    ref: { displayId: "IES-20110", title: "Portal-Login: Passkey-Registrierung nachziehen" } }),
  createTicket({ id: "bug-gis", projectId: P, issueType: "Bug", status: "To Do", assignee: "Philip", updatedAt: ago(160),
    ref: { displayId: "IES-23940", title: "GIS-Map Sperrungen Layers nicht automatisch als selektierter Layer" } }),
  createTicket({ id: "story-done", projectId: P, issueType: "Story", status: "Done", assignee: "Philip", updatedAt: ago(26),
    ref: { displayId: "IES-19001", title: "Sprint-Board: Filter nach Verantwortlichem" } }),
];

const nxaiTickets: readonly ProjectTicket[] = [
  createTicket({ id: "nx-epic-roles", projectId: NXAI.id, issueType: "Epic", status: "In Progress", assignee: "Philip", updatedAt: ago(40),
    ref: { displayId: "NXAI-6", title: "Rollendefinitionen" } }),
  createTicket({ id: "nx-dev-role", projectId: NXAI.id, issueType: "Story", parentId: "nx-epic-roles", status: "In Analysis", assignee: "Philip", updatedAt: ago(8),
    ref: { displayId: "NXAI-8", title: "Dev-Rolle" } }),
  createTicket({ id: "nx-digest", projectId: NXAI.id, issueType: "Story", status: "In Progress", assignee: "Philip", updatedAt: ago(0.5),
    ref: { displayId: "NXAI-480", title: "Work coordination: above the 100-chat problem" } }),
  createTicket({ id: "nx-composer", projectId: NXAI.id, issueType: "Story", status: "In Progress", assignee: "Philip", updatedAt: ago(50),
    ref: { displayId: "TEB-40", title: "Cursor Composer" } }),
];

const iesGraphWithoutSprint: DigestGraph = {
  scope: "project",
  projects: [IES],
  viewer,
  tickets: iesTickets,
  claims: [
    { threadId: "thr-liste", threadTitle: "IES-18425 Liste FE umsetzen", ticketId: "task-liste", agent: "Nexplore AI", lastActivityAt: ago(0.5) },
    { threadId: "thr-formular", threadTitle: "IES-18419 Formular nachziehen", ticketId: "task-formular", agent: "GPT Luna", lastActivityAt: ago(6) },
    { threadId: "thr-api", threadTitle: "IES-18430 Pagination", ticketId: "task-api", agent: "Nexplore AI", lastActivityAt: ago(2) },
    { threadId: "thr-la-fe", threadTitle: "IES-18240 Spalten", ticketId: "task-la-fe", agent: "Nexplore AI", lastActivityAt: ago(10) },
    { threadId: "thr-pf-notif", threadTitle: "IES-23721 Validate forms", ticketId: "task-pf-notif", agent: "Nexplore AI", lastActivityAt: ago(1.5) },
    { threadId: "thr-pf-user", threadTitle: "IES-23720 Validate forms", ticketId: "task-pf-user", agent: "GPT Luna", lastActivityAt: ago(4) },
    { threadId: "thr-unterordner", threadTitle: "Root-Ordner Bug eingrenzen", ticketId: "bug-unterordner", agent: "Nexplore AI", lastActivityAt: ago(96) },
    { threadId: "thr-freigeben", threadTitle: "Freigabe-Dialog Spike", ticketId: "story-freigeben", agent: "Claude Opus", lastActivityAt: ago(80) },
  ],
  decisions: [
    { id: "dec-1", ticketId: "task-formular", threadId: "thr-formular", requiredRole: "Product Owner", askedAt: ago(3),
      question: "Kostenstelle auch für Rückbuchungen Pflicht?" },
    { id: "dec-2", ticketId: "story-leistungsadmin", threadId: "thr-la", requiredRole: "Product Owner", askedAt: ago(20),
      question: "Testfall 4: Rundung – Anforderung oder Bug?" },
  ],
  changeRequests: [
    { id: "pr-441", ticketId: "task-liste", repo: "hive/ies-koordination", number: 762, state: "needs-you", updatedAt: ago(1) },
    { id: "pr-438", ticketId: "story-detail", repo: "hive/ies-spital", number: 64, state: "changes-requested", updatedAt: ago(28) },
    { id: "pr-262", ticketId: "task-pf-notif", repo: "hive/ies-base-notifications", number: 262, state: "waiting", updatedAt: ago(5) },
    { id: "pr-320", ticketId: "task-pf-notif", repo: "hive/ies-alarm", number: 320, state: "waiting", updatedAt: ago(5) },
    { id: "pr-323", ticketId: "task-pf-user", repo: "hive/ies-base-uicomponents", number: 323, state: "approved", updatedAt: ago(2) },
  ],
  transitions: [
    { ticketId: "task-liste", from: "In Progress", to: "Code Review", at: ago(1) },
    { ticketId: "story-leistungsadmin", from: "Code Review", to: "In Test", at: ago(4) },
    { ticketId: "story-done", from: "In Test", to: "Done", at: ago(26) },
  ],
};

export const digestFixtureGraph: DigestGraph = {
  ...iesGraphWithoutSprint,
  sprint: {
    name: "PW Sprint 8.5",
    goal: ["Ready für FAT, möglichst viele Bugs gefixt", "Deep-Link aus PI-5 sichtbar", "PSD kann den Mobile Absprung nutzen"],
    startDate: "2026-09-03T00:00:00.000Z",
    endDate: "2026-09-23T00:00:00.000Z",
  },
};

export const digestFixtureAgentPlan: DigestPlan = {
  producer: "agent",
  producedAt: ago(2),
  sections: [
    { id: "unblock", kind: "items", placement: "side", heading: "Two answers unblock three agents",
      items: [
        { ticketId: "task-formular", why: "GPT Luna is waiting on the Kostenstelle rule." },
        { ticketId: "story-leistungsadmin", why: "Test blocked since yesterday." },
      ] },
    { id: "review-chain", kind: "items", placement: "side", heading: "Review first",
      hint: "#762 is the parent of the #64 fix.",
      items: [{ ticketId: "task-liste" }, { ticketId: "story-detail", why: "Changes requested 28 h ago, nobody picked it up." }] },
    { id: "order", kind: "items", placement: "main", heading: "Recommended order",
      items: [
        { ticketId: "task-api" }, { ticketId: "task-la-fe" }, { ticketId: "task-la-test" },
        { ticketId: "task-pf-notif", why: "Four PRs waiting on reviewers, none on you." }, { ticketId: "task-pf-user" },
        { ticketId: "bug-gis" },
      ] },
    { id: "cold", kind: "items", placement: "footer", heading: "Cold agent threads", hint: "silent > 3 d · nudge or release",
      items: [{ ticketId: "bug-unterordner" }, { ticketId: "story-freigeben" }] },
    { id: "parked", kind: "items", placement: "footer", heading: "Parked", hint: "nothing needed from you",
      items: [{ ticketId: "story-import" }, { ticketId: "task-passkey" }] },
  ],
};

function withGraphChanges(graph: DigestGraph): DigestGraph {
  const closed = new Set(["story-freigeben", "task-passkey"]);
  const added: readonly ProjectTicket[] = [
    createTicket({ id: "bug-neu", projectId: P, issueType: "Bug", status: "To Do", assignee: "Philip", priority: "High", updatedAt: ago(0.3),
      ref: { displayId: "IES-20231", title: "Export CSV: Umlaute falsch kodiert" } }),
    createTicket({ id: "task-neu", projectId: P, issueType: "Task", status: "In Progress", assignee: "Philip", updatedAt: ago(0.2),
      ref: { displayId: "IES-20232", title: "Release Notes 2026.9 vorbereiten" } }),
  ];
  return {
    ...graph,
    tickets: [...graph.tickets.map((t) => (closed.has(t.id) ? { ...t, status: "Done", updatedAt: ago(0.4) } : t)), ...added],
    claims: [...graph.claims, { threadId: "thr-neu", threadTitle: "Release Notes entwerfen", ticketId: "task-neu", agent: "Nexplore AI", lastActivityAt: ago(0.1) }],
  };
}

const allProjectsGraph: DigestGraph = {
  ...iesGraphWithoutSprint,
  scope: "all",
  projects: [IES, NXAI],
  tickets: [...iesTickets, ...nxaiTickets],
  claims: [
    ...digestFixtureGraph.claims,
    { threadId: "thr-nx-digest", threadTitle: "Work Coordination View Modes", ticketId: "nx-digest", agent: "Claude Fable", lastActivityAt: ago(0.2) },
  ],
  decisions: [
    ...digestFixtureGraph.decisions,
    { id: "dec-nx", ticketId: "nx-dev-role", threadId: "thr-nx-role", requiredRole: "Product Owner", askedAt: ago(30),
      question: "Dev-Rolle: darf sie Recipes publizieren?" },
  ],
};

export type ProjectMyWorkDigestFixtureScenario = {
  readonly graph: DigestGraph;
  readonly arrangement: DigestArrangement;
};

const emptyGraph: DigestGraph = { scope: "project", projects: [IES], viewer, tickets: [], claims: [], decisions: [], changeRequests: [], transitions: [] };

export const emptyGraphScenario: ProjectMyWorkDigestFixtureScenario = { graph: emptyGraph, arrangement: { state: "off" } };
export const heuristicArrangementScenario: ProjectMyWorkDigestFixtureScenario = { graph: digestFixtureGraph, arrangement: { state: "off" } };
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
export const allProjectsHeuristicScenario: ProjectMyWorkDigestFixtureScenario = { graph: allProjectsGraph, arrangement: { state: "off" } };
export const allProjectsAgentScenario: ProjectMyWorkDigestFixtureScenario = {
  graph: allProjectsGraph,
  arrangement: {
    state: "live",
    refreshing: false,
    plan: {
      ...digestFixtureAgentPlan,
      sections: [
        { id: "unblock", kind: "items", placement: "side", heading: "Three answers, two projects",
          items: [{ ticketId: "task-formular" }, { ticketId: "story-leistungsadmin" }, { ticketId: "nx-dev-role", why: "Blocks the role epic for two weeks now." }] },
        ...digestFixtureAgentPlan.sections.slice(1, 2),
        { id: "order", kind: "items", placement: "main", heading: "Recommended order",
          items: [{ ticketId: "nx-digest", why: "Live exploration thread, answer while it is warm." }, { ticketId: "task-api" }, { ticketId: "task-la-fe" }, { ticketId: "task-pf-notif" }, { ticketId: "task-pf-user" }, { ticketId: "nx-composer" }] },
        ...digestFixtureAgentPlan.sections.slice(3),
      ],
    },
  },
};

export function ProjectMyWorkDigestFixtureView({ scenario }: { scenario: ProjectMyWorkDigestFixtureScenario }) {
  const [lens, setLens] = useState<ProjectMyWorkLens>("digest");
  const [arrangement, setArrangement] = useState<DigestArrangement>(scenario.arrangement);
  const nowMs = DIGEST_FIXTURE_NOW_MS;
  const basePlan = arrangement.state === "live" || arrangement.state === "paused" ? arrangement.plan : buildHeuristicDigestPlan(scenario.graph, nowMs);
  const plan = resolveDigestPlan(basePlan, scenario.graph, nowMs);
  const start = () => {
    setArrangement({ state: "starting" });
    window.setTimeout(() => setArrangement({ state: "live", plan: { ...digestFixtureAgentPlan, producedAt: new Date(nowMs).toISOString() }, refreshing: false }), 1200);
  };
  return (
    <div className="min-h-screen bg-background px-8 py-7 text-foreground xl:px-12">
      <div className="mx-auto max-w-[110rem] space-y-6">
        <ProjectMyWorkDigestHeader graph={scenario.graph} nowMs={nowMs} />
        <ProjectMyWorkDigestToolbar
          lens={lens}
          onLensChange={setLens}
          arrangement={arrangement}
          newSinceCount={plan.newSinceTicketIds.length}
          nowMs={nowMs}
          graphEmpty={scenario.graph.tickets.length === 0}
          onStart={start}
          onPause={() => setArrangement((c) => (c.state === "live" ? { state: "paused", plan: c.plan } : c))}
          onResume={() => setArrangement((c) => (c.state === "paused" ? { state: "live", plan: c.plan, refreshing: false } : c))}
        />
        {lens === "digest" ? (
          <ProjectMyWorkDigestView plan={plan} graph={scenario.graph} nowMs={nowMs} onOpenTicket={() => undefined} />
        ) : (
          <p className="text-sm text-muted-foreground">{lens === "hierarchy" ? "Hierarchy" : "Board"} lens: existing My Work view over the same graph.</p>
        )}
      </div>
    </div>
  );
}
