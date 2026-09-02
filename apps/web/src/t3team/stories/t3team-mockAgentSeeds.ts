import { ACTIVITY_STATE_WORDS, type ActivityState } from "~/t3team/t3team-activityStateDisplay";
import type { ActiveAgentEntry } from "~/t3team/chat/t3team-activeAgentsCore";

/**
 * Mock agent seeds + drift rolls for the status-dot stories.
 *
 * `source` distinguishes the two REAL kinds the indicator supports:
 * child threads and provider-native subagents — the stories feed both
 * through the same `TimelineRowActivityCtx` seam the app uses.
 */

export type DotState = ActivityState | "settled";

export const AGENT_STATES: readonly DotState[] = [
  "thinking",
  "writing",
  "working",
  "waiting",
  "settled",
];
export const THREAD_STATES: readonly DotState[] = [
  "thinking",
  "writing",
  "working",
  "waiting",
  "settled",
];

/** Weighted random roll: active work dominates, waiting/settled are rarer. */
export function rollState(pool: readonly DotState[], weights: readonly number[]): DotState {
  let r = Math.random();
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i] ?? 0;
    if (r <= 0) return pool[i] ?? "working";
  }
  return pool[pool.length - 1] ?? "working";
}

const AGENT_WEIGHTS = [0.3, 0.1, 0.35, 0.15, 0.1]; // thinking/writing/working/waiting/settled
const THREAD_WEIGHTS = [0.3, 0.1, 0.35, 0.15, 0.1];

export type Drift = {
  readonly thread: DotState;
  readonly agents: readonly DotState[];
};

/**
 * One random re-roll. ~60% of the agents change state per roll and the
 * rest hold, so the row keeps moving without reading as static noise.
 */
export function rollDrift(agentCount: number, previous?: Drift): Drift {
  const agents = Array.from({ length: agentCount }, (_, i) => {
    const keep = previous && Math.random() < 0.4;
    return keep ? (previous.agents[i] ?? "working") : rollState(AGENT_STATES, AGENT_WEIGHTS);
  });
  return { thread: rollState(THREAD_STATES, THREAD_WEIGHTS), agents };
}

export type SeedAgent = {
  readonly title: string;
  readonly statusLabel: string;
  readonly source: "child" | "subagent";
  readonly dotState: DotState;
};

export const CHILD_SEEDS: readonly SeedAgent[] = [
  {
    title: "Fix the flaky retry test",
    statusLabel: "Editing tests",
    source: "child",
    dotState: "writing",
  },
  {
    title: "Draft the release notes",
    statusLabel: "Reading contracts",
    source: "child",
    dotState: "thinking",
  },
  {
    title: "Review the provider registry diff",
    statusLabel: "Working",
    source: "child",
    dotState: "working",
  },
  {
    title: "Scrape the docs site",
    statusLabel: "Running build",
    source: "child",
    dotState: "working",
  },
  {
    title: "Split the billing service",
    statusLabel: "Planning steps",
    source: "child",
    dotState: "thinking",
  },
];

export const SUBAGENT_SEEDS: readonly SeedAgent[] = [
  {
    title: "Review release risks",
    statusLabel: "Checking API compatibility",
    source: "subagent",
    dotState: "thinking",
  },
  {
    title: "Assess rollout risk",
    statusLabel: "Reading migration plan",
    source: "subagent",
    dotState: "thinking",
  },
];

/** One entry per active agent; `activityKey` mutates on every simulated event. */
export function buildEntries(
  childCount: number,
  subagentCount: number,
  eventTicks: ReadonlyMap<string, number>,
): ActiveAgentEntry[] {
  const children = CHILD_SEEDS.slice(0, childCount).map((seed, i) => ({
    id: `child-${i}`,
    source: seed.source,
    title: seed.title,
    statusLabel: seed.statusLabel,
    activityKey: `c${i}|${eventTicks.get(`child-${i}`) ?? 0}`,
    dotState: seed.dotState,
  }));
  const subagents = SUBAGENT_SEEDS.slice(0, subagentCount).map((seed, i) => ({
    id: `agent-${i}`,
    source: seed.source,
    title: seed.title,
    statusLabel: seed.statusLabel,
    activityKey: `a${i}|${eventTicks.get(`agent-${i}`) ?? 0}`,
    dotState: seed.dotState,
  }));
  return [...children, ...subagents];
}

/** The human word for a dot state. "settled" reads "done". */
export function stateWordOf(state: DotState): string {
  if (state === "settled") return "done";
  return ACTIVITY_STATE_WORDS[state] ?? "Working";
}
