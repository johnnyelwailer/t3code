/**
 * The poll sequence the My Work digest replay story plays through the real digest hook: what the
 * server answers on each round, and how long it takes. Every kind of tick that used to make the
 * digest flash is in here once, in the order a real session produces them.
 */
import type { MyWorkDigestPayload } from "~/t3team/backend/t3team-myworkDigestBackendApi";

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const VIEWER = "Philip";
const REPLAY_STARTED_AT = Date.now();

type World = {
  readonly firstTitle: string;
  readonly decisionOnTicket: string | undefined;
  readonly jiraSyncPending: boolean;
  readonly syncedMinutesAgo: number;
  readonly extraTicket: boolean;
  readonly dropped: ReadonlySet<string>;
  readonly changeRequestsPending: boolean;
  readonly noTickets: boolean;
};

export type DigestReplayStep = {
  readonly label: string;
  readonly latencyMs: number;
  readonly world: World;
};

const calm: World = {
  firstTitle: "Wire the new digest receipt path",
  decisionOnTicket: undefined,
  jiraSyncPending: false,
  syncedMinutesAgo: 3,
  extraTicket: false,
  dropped: new Set(),
  changeRequestsPending: true,
  noTickets: false,
};

const ticket = (n: number, title: string, status: string, ageHours: number) => ({
  id: `issue-${String(n)}`,
  displayId: `IES-${String(n)}`,
  title,
  provider: "atlassian",
  kind: "issue",
  url: `https://jira.example/browse/IES-${String(n)}`,
  projectId: "IES",
  status,
  assignee: VIEWER,
  sprintState: "active",
  updatedAt: new Date(REPLAY_STARTED_AT - ageHours * 60 * MINUTE).toISOString(),
});

export function replayPayload(world: World): MyWorkDigestPayload {
  const ref = (n: number) => ({ issueId: `issue-${String(n)}`, issueKey: `IES-${String(n)}` });
  const tickets = world.noTickets
    ? []
    : [
        ticket(101, world.firstTitle, "In Progress", 2),
        ticket(102, "Add retry to the Jira poller", "In Review", 5),
        ticket(103, "Fix focus ring on the arrangement bar", "In Progress", 8),
        ticket(104, "Spike: server-sent digest deltas", "To Do", 30),
        ticket(105, "Document the poll fingerprint", "To Do", 52),
        ticket(106, "Clean up legacy lane CSS", "In Progress", 20),
        ...(world.extraTicket
          ? [ticket(107, "Show PR checks inline on rows", "In Progress", 1)]
          : []),
      ].filter((entry) => !world.dropped.has(entry.id));
  return {
    scope: "project",
    viewer: {
      name: VIEWER,
      lastVisitAt: new Date(REPLAY_STARTED_AT - 6 * 60 * MINUTE).toISOString(),
    },
    ...(world.changeRequestsPending ? { changeRequestsPending: true as const } : {}),
    projects: [
      {
        project: { id: "IES", name: "IES NG" },
        tickets,
        claims: world.noTickets
          ? []
          : [
              {
                threadId: "thr-1",
                threadTitle: "IES-102 retry",
                ticketRef: ref(102),
                agent: "codex",
                lastActivityAt: new Date(REPLAY_STARTED_AT - 20 * MINUTE).toISOString(),
              },
            ],
        decisions:
          world.decisionOnTicket === undefined
            ? []
            : [
                {
                  id: "decision-1",
                  threadId: "thr-2",
                  ticketRef: ref(Number(world.decisionOnTicket)),
                  question: "Keep the old lane layout?",
                  askedAt: new Date(REPLAY_STARTED_AT - 4 * MINUTE).toISOString(),
                },
              ],
        changeRequests: [],
        transitions: [],
        sprint: {
          name: "Sprint 12",
          goal: "Calm digest\nFewer flashes",
          startDate: new Date(REPLAY_STARTED_AT - 4 * DAY).toISOString(),
          endDate: new Date(REPLAY_STARTED_AT + 8 * DAY).toISOString(),
        },
        jiraAuth: "ok",
        ...(world.jiraSyncPending
          ? { jiraSyncPending: true }
          : {
              jiraSyncedAt: new Date(
                REPLAY_STARTED_AT - world.syncedMinutesAgo * MINUTE,
              ).toISOString(),
            }),
      },
    ],
  };
}

const step = (label: string, latencyMs: number, change: Partial<World>): DigestReplayStep => ({
  label,
  latencyMs,
  world: { ...calm, ...change },
});

export const DIGEST_REPLAY_STEPS: ReadonlyArray<DigestReplayStep> = [
  step("first round lands", 900, {}),
  step("tick, nothing changed", 350, {}),
  step("tick, server moved but the digest is the same", 450, { syncedMinutesAgo: 2 }),
  step("one ticket retitled", 400, { syncedMinutesAgo: 2, firstTitle: "Wire the digest receipt" }),
  step("ticket moves into Needs you", 500, {
    syncedMinutesAgo: 2,
    firstTitle: "Wire the digest receipt",
    decisionOnTicket: "103",
  }),
  step("Jira sync starts again", 380, {
    firstTitle: "Wire the digest receipt",
    decisionOnTicket: "103",
    jiraSyncPending: true,
  }),
  step("Jira sync done", 420, {
    syncedMinutesAgo: 0,
    firstTitle: "Wire the digest receipt",
    decisionOnTicket: "103",
  }),
  step("one ticket added, one finished", 520, {
    syncedMinutesAgo: 0,
    firstTitle: "Wire the digest receipt",
    decisionOnTicket: "103",
    extraTicket: true,
    dropped: new Set(["issue-106"]),
  }),
  step("pull requests settle", 380, {
    syncedMinutesAgo: 0,
    firstTitle: "Wire the digest receipt",
    decisionOnTicket: "103",
    extraTicket: true,
    dropped: new Set(["issue-106"]),
    changeRequestsPending: false,
  }),
];

/** A first sync still walking the project: nothing to show yet, then everything at once. */
export const DIGEST_REPLAY_EMPTY_FIRST_STEPS: ReadonlyArray<DigestReplayStep> = [
  step("first sync running, no tickets yet", 700, { noTickets: true, jiraSyncPending: true }),
  step("tickets arrive", 500, { syncedMinutesAgo: 0 }),
  step("pull requests settle", 380, { syncedMinutesAgo: 0, changeRequestsPending: false }),
];

/** A re-sync that empties the mirror for a moment: the digest must keep what it showed. */
export const DIGEST_REPLAY_REFILL_STEPS: ReadonlyArray<DigestReplayStep> = [
  step("first round lands", 600, {}),
  step("Jira re-syncs, mirror momentarily empty", 450, { noTickets: true, jiraSyncPending: true }),
  step("mirror refilled", 400, { syncedMinutesAgo: 0, changeRequestsPending: false }),
];
