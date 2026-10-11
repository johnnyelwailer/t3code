/**
 * Whether a cold start on the index route should open My Work instead of the draft landing.
 *
 * The rule: at least one project bound to a work source (the same `selectBoundProjects` set the
 * All-projects My Work view renders) AND My Work would show at least one item. "An item" is what
 * the user's own lens would render: a digest section for the digest lens (the digest's own empty
 * state is `plan.sections.length === 0`), an assigned ticket for the hierarchy/board lenses.
 *
 * Everything that is not a confident "yes" — still loading past the deadline, a failed or retrying
 * fetch, an expired Jira session — falls back to the existing landing, so a slow Jira never blocks
 * startup.
 */
import type { UseMyWorkDigestGraphResult } from "~/t3team/mywork-digest/t3team-useMyWorkDigestGraphTypes";
import type { ProjectMyWorkLens } from "~/t3team/t3team-projectDashboardMyWorkStateShared";
import { buildDigestPlan } from "~/t3team/t3team-projectMyWorkDigestPlan";

export type StartupMyWorkProbe =
  /** Projects or the digest are still loading. */
  | { readonly status: "pending" }
  /** Loaded, or failed: `itemCount` is 0 for any failure. */
  | { readonly status: "settled"; readonly boundProjectCount: number; readonly itemCount: number };

export type StartupLandingDecision = "wait" | "my-work" | "default";

export function decideStartupLanding(input: {
  /** First index landing of this app session, and the app booted on the index route. */
  readonly eligible: boolean;
  readonly probe: StartupMyWorkProbe;
  /** The bounded wait for the probe has elapsed. */
  readonly timedOut: boolean;
}): StartupLandingDecision {
  if (!input.eligible) return "default";
  if (input.probe.status === "pending") return input.timedOut ? "default" : "wait";
  return input.probe.boundProjectCount > 0 && input.probe.itemCount > 0 ? "my-work" : "default";
}

/**
 * Reads the probe from the same inputs `AllProjectsMyWorkView` renders from: its bound projects,
 * its all-projects digest graph, and its resolved lens.
 */
export function deriveStartupMyWorkProbe(input: {
  /** `null` while the stored/live project lists are still loading. */
  readonly boundProjects: ReadonlyArray<unknown> | null;
  readonly digest: Pick<
    UseMyWorkDigestGraphResult,
    "graph" | "status" | "sessionExpired" | "freshness"
  >;
  readonly lens: ProjectMyWorkLens;
  readonly nowMs: number;
}): StartupMyWorkProbe {
  const { boundProjects, digest } = input;
  if (boundProjects === null) return { status: "pending" };
  const settled = (itemCount: number): StartupMyWorkProbe => ({
    status: "settled",
    boundProjectCount: boundProjects.length,
    itemCount,
  });
  if (boundProjects.length === 0 || digest.sessionExpired) return settled(0);
  if (digest.graph !== null) {
    const itemCount =
      input.lens === "digest"
        ? buildDigestPlan(digest.graph, input.nowMs).sections.length
        : digest.graph.tickets.length;
    // A cached graph WITH items opens My Work at once — it paints from that same cache, and a
    // fresh round cannot make the answer worse than "the landing". A cached graph with NOTHING in
    // it is last session's answer: wait for the server rather than send the user to the landing
    // on it, and fall back at the deadline like any other slow round.
    if (digest.freshness === "fresh" || itemCount > 0) return settled(itemCount);
    return { status: "pending" };
  }
  // A failing fetch renders a retry/error state, never items: do not wait it out.
  return digest.status === "loading" ? { status: "pending" } : settled(0);
}

/**
 * True when the document was loaded on the index route — the cold start. `/` is bridged to the
 * Team home `/t3team`, so a reload there is a cold start too. Browser history routes on the
 * pathname; the desktop shell uses hash history, so its route lives in the hash.
 */
export function isIndexBootUrl(url: string, hashRouting: boolean): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  const path = hashRouting ? parsed.hash.replace(/^#/, "").split("?")[0] : parsed.pathname;
  return path === "" || path === "/" || path === "/t3team" || path === "/t3team/";
}

/** The URL this document was loaded from, independent of any client-side navigation since. */
export function readBootUrl(): string | null {
  if (typeof performance === "undefined" || typeof performance.getEntriesByType !== "function") {
    return null;
  }
  const entry = performance.getEntriesByType("navigation")[0];
  return entry?.name ?? null;
}

/**
 * Once per app session (page lifetime). The first index landing decides; any later visit to `/` —
 * including one where the user left My Work for the index on purpose — keeps the draft landing.
 */
let startupLandingDecided = false;

export function isStartupLandingPending(): boolean {
  return !startupLandingDecided;
}

export function markStartupLandingDecided(): void {
  startupLandingDecided = true;
}

/**
 * The gate itself also runs once: the home can unmount and remount within one shell mount (pick a
 * project, then clear it), and that later home must not probe again.
 */
let startupGateClaimed = false;

export function isStartupGateUnclaimed(): boolean {
  return !startupGateClaimed;
}

export function claimStartupGate(): void {
  startupGateClaimed = true;
}

/** Test-only: start a fresh app session. */
export function resetStartupLandingSessionForTests(): void {
  startupLandingDecided = false;
  startupGateClaimed = false;
}
