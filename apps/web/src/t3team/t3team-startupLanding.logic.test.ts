import { afterEach, describe, expect, it } from "vite-plus/test";

import {
  DIGEST_FIXTURE_NOW_MS,
  digestFixtureGraph,
  viewer,
} from "~/t3team/t3team-projectMyWorkDigestFixtures";
import { buildDigestPlan, type DigestGraph } from "~/t3team/t3team-projectMyWorkDigestPlan";
import {
  decideStartupLanding,
  deriveStartupMyWorkProbe,
  isIndexBootUrl,
  isStartupLandingPending,
  markStartupLandingDecided,
  resetStartupLandingSessionForTests,
  type StartupMyWorkProbe,
} from "~/t3team/t3team-startupLanding.logic";

const emptyGraph: DigestGraph = {
  scope: "all",
  projects: [],
  viewer,
  tickets: [],
  claims: [],
  decisions: [],
  changeRequests: [],
  transitions: [],
  blockers: [],
};

const ready = (graph: DigestGraph | null) =>
  ({
    graph,
    status: graph ? "ready" : "loading",
    sessionExpired: false,
    freshness: "fresh",
  }) as const;

/** A graph painted from the persisted cache: the server has not answered for this scope yet. */
const cached = (graph: DigestGraph) =>
  ({ graph, status: "ready", sessionExpired: false, freshness: "cached" }) as const;

const probeFor = (
  boundProjects: ReadonlyArray<unknown> | null,
  digest: Parameters<typeof deriveStartupMyWorkProbe>[0]["digest"],
  lens: "digest" | "board" = "digest",
) => deriveStartupMyWorkProbe({ boundProjects, digest, lens, nowMs: DIGEST_FIXTURE_NOW_MS });

const decide = (probe: StartupMyWorkProbe, timedOut = false) =>
  decideStartupLanding({ eligible: true, probe, timedOut });

describe("startup landing", () => {
  it("keeps the draft landing when no project is bound to Jira", () => {
    // No digest fetch runs without a bound project, so the hook never leaves "loading".
    expect(decide(probeFor([], ready(null)))).toBe("default");
  });

  it("keeps the draft landing when Jira is bound but My Work has nothing to show", () => {
    expect(buildDigestPlan(emptyGraph, DIGEST_FIXTURE_NOW_MS).sections).toHaveLength(0);
    expect(decide(probeFor(["p"], ready(emptyGraph)))).toBe("default");
    expect(decide(probeFor(["p"], ready(emptyGraph), "board"))).toBe("default");
  });

  it("opens My Work when it has items, by the user's own lens", () => {
    expect(decide(probeFor(["p"], ready(digestFixtureGraph)))).toBe("my-work");
    expect(decide(probeFor(["p"], ready(digestFixtureGraph), "board"))).toBe("my-work");
  });

  it("waits, without painting, while projects or the digest are loading", () => {
    expect(decide(probeFor(null, ready(null)))).toBe("wait");
    expect(decide(probeFor(["p"], ready(null)))).toBe("wait");
  });

  it("falls back once a slow load outlasts the deadline", () => {
    expect(decide(probeFor(null, ready(null)), true)).toBe("default");
    expect(decide(probeFor(["p"], ready(null)), true)).toBe("default");
    // Data that lands in time still wins over the deadline.
    expect(decide(probeFor(["p"], ready(digestFixtureGraph)), true)).toBe("my-work");
  });

  it("falls back at once when the digest fails or the Jira session expired", () => {
    for (const status of ["retrying", "error"] as const) {
      expect(
        decide(probeFor(["p"], { graph: null, status, sessionExpired: false, freshness: "cached" })),
      ).toBe("default");
    }
    expect(
      decide(
        probeFor(["p"], {
          graph: null,
          status: "loading",
          sessionExpired: true,
          freshness: "cached",
        }),
      ),
    ).toBe("default");
  });

  it("opens My Work straight from the persisted cache when it already has items", () => {
    // The cold-start payoff: the redirect happens before the first round answers, and My Work
    // paints the same cached graph.
    expect(decide(probeFor(["p"], cached(digestFixtureGraph)))).toBe("my-work");
  });

  it("waits out an EMPTY cached graph instead of landing on last session's answer", () => {
    expect(decide(probeFor(["p"], cached(emptyGraph)))).toBe("wait");
    // Still bounded: the deadline falls back like any other slow round.
    expect(decide(probeFor(["p"], cached(emptyGraph)), true)).toBe("default");
  });

  it("never redirects a landing that is not eligible", () => {
    const probe = probeFor(["p"], ready(digestFixtureGraph));
    expect(decideStartupLanding({ eligible: false, probe, timedOut: false })).toBe("default");
  });
});

describe("startup landing session guard", () => {
  afterEach(() => resetStartupLandingSessionForTests());

  it("decides once per app session, so returning to / never bounces back to My Work", () => {
    expect(isStartupLandingPending()).toBe(true);
    markStartupLandingDecided();
    expect(isStartupLandingPending()).toBe(false);
    markStartupLandingDecided();
    expect(isStartupLandingPending()).toBe(false);
  });

  it("only treats a document loaded on the index route as a cold start", () => {
    expect(isIndexBootUrl("https://app.t3.codes/", false)).toBe(true);
    expect(isIndexBootUrl("https://app.t3.codes/?x=1", false)).toBe(true);
    expect(isIndexBootUrl("https://app.t3.codes/settings", false)).toBe(false);
    expect(isIndexBootUrl("https://app.t3.codes/env/thread", false)).toBe(false);
    // Desktop routes in the hash.
    expect(isIndexBootUrl("t3code://app/index.html", true)).toBe(true);
    expect(isIndexBootUrl("t3code://app/index.html#/", true)).toBe(true);
    expect(isIndexBootUrl("t3code://app/index.html#/settings", true)).toBe(false);
    expect(isIndexBootUrl("not a url", false)).toBe(false);
  });
});
