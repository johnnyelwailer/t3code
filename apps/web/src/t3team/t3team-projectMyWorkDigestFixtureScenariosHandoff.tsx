/**
 * A made-up team (Acme) for two digest rules: a merged PR that still lists the viewer as reviewer
 * stays out of "To review", and a story of the viewer's in test leaves the epic card it shared
 * with their in-progress story, whose card keeps only live blocks and folds the epic's other
 * stories into one count.
 */
import type { MyWorkDigestPayload } from "~/t3team/backend/t3team-myworkDigestBackendApi";
import { digestReviewRequests } from "~/t3team/mywork-digest/t3team-digestGraphPrJoins";
import { createProjectBacklogTestTicket as createTicket } from "~/t3team/t3team-projectBacklogTestUtils";
import { ago } from "~/t3team/t3team-projectMyWorkDigestFixtures";
import type { ProjectMyWorkDigestFixtureScenario } from "~/t3team/t3team-projectMyWorkDigestFixtureScenarios";
import type { DigestDependency, DigestGraph } from "~/t3team/t3team-projectMyWorkDigestPlan";
import type { ProjectTicket } from "~/t3team/t3team-types";

const P = "project-acme";
const VIEWER = "Alex Doe";

const story = (key: string, title: string, status: string, assignee?: string): ProjectTicket =>
  createTicket({
    id: key,
    projectId: P,
    issueType: "Story",
    parentId: "ACME-100",
    status,
    sprintState: "active",
    ...(assignee ? { assignee } : {}),
    updatedAt: ago(6),
    ref: { displayId: key, title, url: `https://jira.example.test/browse/${key}` },
  });

const tickets: readonly ProjectTicket[] = [
  createTicket({
    id: "ACME-100",
    projectId: P,
    issueType: "Epic",
    status: "In Progress",
    assignee: "Kim Lee",
    updatedAt: ago(30),
    ref: { displayId: "ACME-100", title: "Patient record, part 1" },
  }),
  story("ACME-101", "Web: Notes widget", "In Test", VIEWER),
  story("ACME-102", "Web: File storage enabler", "In Progress", VIEWER),
  story("ACME-110", "Web: Risk factors widget", "In Test", "Sam Roe"),
  story("ACME-111", "Native: Risk factors widget", "In Review", "Jo Park"),
  story("ACME-112", "Web: Risk factors in header", "Accepted"),
  story("ACME-113", "Native: Risk factors in header", "Accepted"),
  story("ACME-114", "Web: Record shell and location switch", "In Test", "Sam Roe"),
  story("ACME-115", "Refinement effort, part 2", "In Progress"),
  story("ACME-116", "Hospital processes on the web", "PO Review", "Max Ford"),
  story("ACME-117", "Web: Risk factors, special cases", "In Review", "Jo Park"),
];

const link = (
  ticketId: string,
  relation: DigestDependency["relation"],
  key: string,
  title: string,
  status: string,
  assignee?: string,
): DigestDependency => ({
  ticketId,
  relation,
  other: { key, title, status, ...(assignee ? { assignee } : {}) },
});

type Projects = MyWorkDigestPayload["projects"];
// What the server sends: an open PR waiting on the viewer, and one merged weeks ago that the host
// still lists them on as reviewer (nobody answered the request before it merged).
const waitingOnViewer = [
  {
    id: "github.example:acme/web#88",
    host: "github.example",
    repo: "acme/web",
    number: 88,
    state: "needs-you",
    updatedAt: ago(5),
    title: "ACME-130 Patient PDF summary",
    viewerReviewRequested: true,
    authorLogin: "jpark",
    additions: 412,
    deletions: 37,
  },
  {
    id: "github.example:acme/links#27",
    host: "github.example",
    repo: "acme/links",
    number: 27,
    state: "merged",
    updatedAt: ago(28 * 24),
    title: "ACME-140 Implement remote link components",
    viewerReviewRequested: true,
    authorLogin: "kimlee",
  },
] as unknown as Projects[number]["changeRequests"];

export const handoffEpicGraph: DigestGraph = {
  scope: "project",
  projects: [{ id: P, name: "Acme Web" }],
  viewer: { name: VIEWER, role: "Developer", lastVisitAt: ago(18) },
  sprint: {
    name: "Sprint 9.1",
    goal: ["Patient record ready for acceptance"],
    startDate: ago(7 * 24),
    endDate: ago(-14 * 24),
  },
  tickets,
  claims: [],
  decisions: [],
  changeRequests: [
    {
      id: "pr-47",
      ticketId: "ACME-101",
      title: "ACME-101 Notes: empty widgets show no last entry",
      repo: "acme/web",
      number: 47,
      state: "draft",
      updatedAt: ago(9),
      reviewers: [],
    },
    {
      id: "pr-41",
      ticketId: "ACME-101",
      title: "ACME-101 Notes widget",
      repo: "acme/web",
      number: 41,
      state: "merged",
      updatedAt: ago(8 * 24),
      reviewers: [],
    },
  ],
  reviewRequests: digestReviewRequests(
    [{ changeRequests: waitingOnViewer }] as unknown as Projects,
    () => "",
    () => P,
  ),
  dependencies: [
    // The in-test story's block: its work merged, so it holds nobody up any more.
    link("ACME-101", "waits-on-you", "ACME-120", "Notes: rich text", "In Analysis", "Jo Park"),
    // The in-progress story's blocks are real.
    link(
      "ACME-102",
      "waits-on-you",
      "ACME-121",
      "File upload for patients",
      "In Progress",
      "Sam Roe",
    ),
    link("ACME-102", "waits-on-you", "ACME-122", "File storage in templates", "Accepted", VIEWER),
    link("ACME-102", "waits-on-you", "ACME-123", "File storage for documents", "To Do"),
    // An older server's "same story" for a story under an epic: epic neighbours.
    link("ACME-101", "same-story", "ACME-118", "Native: Notes widget", "In Review", "Jo Park"),
  ],
  transitions: [],
  blockers: [],
};

export const handoffEpicScenario: ProjectMyWorkDigestFixtureScenario = {
  graph: handoffEpicGraph,
  arrangement: { state: "off" },
};
