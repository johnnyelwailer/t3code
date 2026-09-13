import { describe, expect, it } from "vite-plus/test";

import { cloudSessionElapsedSeconds, deriveCloudSessionPhase } from "./t3team-cloudSessionPhase.ts";
import type { WorkflowJobStep, WorkflowRunSummary } from "./t3team-githubActionsSessionClient.ts";

const CREATED_AT = "2026-09-12T21:28:18Z";

function run(overrides: Partial<WorkflowRunSummary> = {}): WorkflowRunSummary {
  return {
    id: 248523362,
    status: "in_progress",
    conclusion: null,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    htmlUrl: "https://nexplore.ghe.com/hive/nx-nexi/actions/runs/248523362",
    name: "hive/nx-nexi [main] [c9f4a2]",
    ...overrides,
  };
}

/**
 * The real step list from the first green run (hive/nx-nexi 248523362),
 * truncated to whatever had happened by a given moment. `upTo` steps are
 * finished and the next one is running, which is exactly what the API reports
 * mid-run.
 */
const GREEN_RUN_STEPS = [
  "Set up job",
  "Verify required T3 Connect secrets",
  "Install Node 24 and pnpm 11.10.0",
  "Install cloudflared (T3 Connect relay client)",
  "Checkout the t3code fork",
  "Install dependencies and build the fork",
  "Seed T3CODE_HOME with portable auth state",
  "Start t3 serve and wait for pairing details",
  "Capture connect status",
  "Publish pairing details to a GitHub issue",
  "Hold the session, then stop t3 serve",
  "Complete job",
] as const;

function stepsUpTo(finished: number): readonly WorkflowJobStep[] {
  return GREEN_RUN_STEPS.slice(0, finished + 1).map((name, index) => ({
    name,
    status: index < finished ? "completed" : "in_progress",
    conclusion: index < finished ? "success" : null,
  }));
}

/** The steps the API would have reported at the start of a not-yet-started job. */
function stepsThrough(finished: number): readonly WorkflowJobStep[] {
  return GREEN_RUN_STEPS.slice(0, finished).map((name) => ({
    name,
    status: "completed",
    conclusion: "success",
  }));
}

describe("deriveCloudSessionPhase", () => {
  it("reports a cleanly finished run as stopped, not failed", () => {
    // The workflow holds the machine and then exits 0 on purpose. Treating that
    // as a failure would mark every healthy session red when it expires.
    expect(deriveCloudSessionPhase(run({ status: "completed", conclusion: "success" }), [])).toBe(
      "stopped",
    );
  });

  it.each(["failure", "cancelled", "timed_out", null])(
    "reports a completed run with conclusion %s as failed",
    (conclusion: string | null) => {
      expect(deriveCloudSessionPhase(run({ status: "completed", conclusion }), [])).toBe("failed");
    },
  );

  it.each(["queued", "pending", "waiting"])("reports %s as queued", (status: string) => {
    expect(deriveCloudSessionPhase(run({ status }), [])).toBe("queued");
  });

  it("reports an in-progress run with no steps yet as requested", () => {
    // [] is an authoritative "nothing has started" — only then is the coarsest
    // in-progress phase certain.
    expect(deriveCloudSessionPhase(run(), [])).toBe("requested");
  });

  it("never demotes a session that already reached ready to requested on a flaky jobs poll", () => {
    // The regression the null-vs-[] distinction exists for: a truncated or
    // error response on one poll must not read as "nothing has started". The
    // coarsest phase that is certainly true is preparing — never requested.
    expect(deriveCloudSessionPhase(run(), null)).toBe("preparing");
  });

  it("keeps a session at starting when Start t3 serve failed but the run lives on", () => {
    // A failed step must count as reached: if only success counted, a dying
    // session would fall back to preparing while its job runs cleanup.
    // `stepsThrough(7)` stops BEFORE "Start t3 serve" (index 7) so the only
    // occurrence of that step is the failed one appended below. An earlier
    // version of this test used `stepsThrough(8)`, which already contained a
    // SUCCESSFUL "Start t3 serve"; `findByPrefix` matched that one and the
    // assertion held even with the bug reintroduced. Verified by mutation:
    // reverting `reached()` now fails this test.
    const steps: readonly WorkflowJobStep[] = [
      ...stepsThrough(7),
      {
        name: "Start t3 serve and wait for pairing details",
        status: "completed",
        conclusion: "failure",
      },
    ];
    expect(deriveCloudSessionPhase(run(), steps)).toBe("starting");
  });

  it("walks the real green run through every phase in order", () => {
    // Indices into GREEN_RUN_STEPS -> the phase a client should see.
    // Step 8 (`Capture connect status`) is asserted separately: its rule turns
    // on success rather than on having started.
    const expected: ReadonlyArray<readonly [number, string]> = [
      [0, "preparing"], // Set up job
      [3, "preparing"], // installing cloudflared
      [4, "preparing"], // Checkout the t3code fork
      [5, "preparing"], // Install dependencies and build the fork
      [7, "starting"], // Start t3 serve
      [10, "ready"], // Hold the session
    ];
    for (const [finished, phase] of expected) {
      expect(deriveCloudSessionPhase(run(), stepsUpTo(finished)), `after step ${finished}`).toBe(
        phase,
      );
    }
  });

  it("only calls a session ready once connect status actually succeeded", () => {
    // `Capture connect status` polls until the relay reports the environment
    // link. While it is still running the session is not reachable yet.
    const running = stepsUpTo(8);
    expect(deriveCloudSessionPhase(run(), running)).toBe("starting");

    const succeeded = running.map((step) =>
      step.name === "Capture connect status"
        ? { ...step, status: "completed" as const, conclusion: "success" as const }
        : step,
    );
    expect(deriveCloudSessionPhase(run(), succeeded)).toBe("ready");
  });

  it("never reports a coarser phase across consecutive polls of one healthy session", () => {
    // Regression: any single poll that demotes the phase reads as a session
    // marching backwards in the UI. The sequence below is what the API hands
    // back down one healthy session's lifetime. (A flaky poll after ready is
    // asserted separately: it may coarsen to preparing, but never to requested.)
    const order: Readonly<Record<string, number>> = {
      requested: 0,
      queued: 1,
      preparing: 2,
      starting: 3,
      ready: 4,
    };
    // Terminal phases are exempt: a session leaving the list is not backwards.
    const terminal = new Set(["failed", "stopped"]);

    const polls: ReadonlyArray<readonly [WorkflowRunSummary, readonly WorkflowJobStep[] | null]> = [
      [run({ status: "queued" }), []],
      [run(), null], // flaky jobs poll the moment the job starts
      [run(), stepsUpTo(0)], // Set up job running
      [run(), stepsUpTo(4)], // checkout in flight
      [run(), stepsUpTo(7)], // t3 serve running
      [run(), stepsUpTo(8)], // capture connect status running
      [run(), stepsUpTo(9)], // status captured, publishing
      [run(), stepsUpTo(10)], // holding the session
      [
        run({ status: "completed", conclusion: "success", updatedAt: "2026-09-12T21:40:00Z" }),
        stepsUpTo(11),
      ],
    ];

    let highest = -1;
    for (const [index, [pollRun, pollSteps]] of polls.entries()) {
      const phase = deriveCloudSessionPhase(pollRun, pollSteps);
      if (terminal.has(phase)) {
        expect(phase, `poll ${index}`).toBe("stopped");
        break;
      }
      const rank = order[phase] ?? -1;
      expect(rank, `poll ${index} reported an unknown phase: ${phase}`).toBeGreaterThanOrEqual(0);
      expect(
        rank,
        `poll ${index} demoted the session to ${phase} after it had reached ${highest}`,
      ).toBeGreaterThanOrEqual(highest);
      highest = rank;
    }
  });

  it("falls back to preparing when the workflow's step names change", () => {
    // A renamed workflow must degrade to a coarser phase, never crash the list.
    const renamed: readonly WorkflowJobStep[] = [
      { name: "Totally different step", status: "in_progress", conclusion: null },
    ];
    expect(deriveCloudSessionPhase(run(), renamed)).toBe("preparing");
  });
});

describe("cloudSessionElapsedSeconds", () => {
  it("measures from the run's creation", () => {
    const nowMs = Date.parse(CREATED_AT) + 154_000;
    expect(cloudSessionElapsedSeconds(run(), nowMs)).toBe(154);
  });

  it("clamps a future createdAt to zero rather than reporting negative time", () => {
    const nowMs = Date.parse(CREATED_AT) - 60_000;
    expect(cloudSessionElapsedSeconds(run(), nowMs)).toBe(0);
  });

  it("returns zero for an unparseable timestamp", () => {
    // The clock is irrelevant here; a fixed "now" keeps the test deterministic.
    expect(cloudSessionElapsedSeconds(run({ createdAt: "not a date" }), 0)).toBe(0);
  });
});
