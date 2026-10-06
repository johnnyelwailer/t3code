import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { ChildProcessSpawner } from "effect/unstable/process";

import type * as VcsProcess from "../vcs/VcsProcess.ts";
import { workflowHistoryUrl } from "./t3team-CloudSessionFleet.ts";
import { projectCloudSession } from "./t3team-CloudSessionProjection.ts";
import {
  cloudSessionFailureReason,
  makeFailureReasonCache,
} from "./t3team-cloudSessionFailureReason.ts";
import type {
  CloudSessionRepoRef,
  GhInvocation,
  WorkflowRunSummary,
} from "./t3team-githubActionsSessionClient.ts";

const repoRef: CloudSessionRepoRef = {
  host: "nexplore.ghe.com",
  owner: "hive",
  repo: "nx-nexi",
  workflowFileName: "session.yml",
};

const failedRun: WorkflowRunSummary = {
  id: 77,
  status: "completed",
  conclusion: "failure",
  createdAt: "2026-09-28T10:00:00Z",
  updatedAt: "2026-09-28T10:02:00Z",
  htmlUrl: "https://nexplore.ghe.com/hive/nx-nexi/actions/runs/77",
  name: "nexi-session [s1]",
};

const ghOut = (stdout: string): VcsProcess.VcsProcessOutput => ({
  exitCode: ChildProcessSpawner.ExitCode(0),
  stdout,
  stderr: "",
  stdoutTruncated: false,
  stderrTruncated: false,
});

const JOBS_WITH_FAILED_STEP = JSON.stringify({
  jobs: [
    {
      steps: [
        { name: "Checkout the t3code fork", status: "completed", conclusion: "success" },
        {
          name: "Start t3 serve and wait for pairing details",
          status: "completed",
          conclusion: "failure",
        },
        { name: "Hold the session until release", status: "completed", conclusion: "skipped" },
      ],
    },
  ],
});

/** A fake `gh` that answers every jobs read with `stdout` and counts the calls. */
const fakeGh = (stdout: string) => {
  const calls: GhInvocation[] = [];
  const run = (invocation: GhInvocation) =>
    Effect.sync(() => {
      calls.push(invocation);
      return ghOut(stdout);
    });
  return { calls, run };
};

describe("cloudSessionFailureReason", () => {
  it("names the step that failed instead of the bare conclusion", () => {
    const steps = [
      { name: "Install dependencies", status: "completed", conclusion: "success" },
      { name: "Capture connect status", status: "completed", conclusion: "failure" },
    ];
    assert.equal(
      cloudSessionFailureReason(failedRun, steps),
      "Failed at “Capture connect status”.",
    );
  });

  it("says a step timed out when it did", () => {
    const steps = [{ name: "Start t3 serve", status: "completed", conclusion: "timed_out" }];
    assert.equal(cloudSessionFailureReason(failedRun, steps), "Timed out at “Start t3 serve”.");
  });

  it("says the machine stopped responding when the run ended mid-step (a lost runner)", () => {
    const steps = [
      { name: "Set up job", status: "completed", conclusion: "success" },
      { name: "Install Node 24 and pnpm 11.10.0", status: "in_progress", conclusion: null },
      { name: "Bring up the project machine", status: "pending", conclusion: null },
    ];
    assert.equal(
      cloudSessionFailureReason(failedRun, steps),
      "The cloud machine stopped responding at “Install Node 24 and pnpm 11.10.0”. Start another to try again.",
    );
  });

  it("says no machine became free when no step ever started", () => {
    const steps = [{ name: "Set up job", status: "pending", conclusion: null }];
    assert.equal(
      cloudSessionFailureReason(failedRun, steps),
      "No cloud machine became free in time. Start another to try again.",
    );
  });

  it("falls back to the run conclusion, then a concise generic — never the raw string", () => {
    assert.equal(
      cloudSessionFailureReason({ conclusion: "timed_out" }, null),
      "The session hit its time limit before it became reachable.",
    );
    assert.equal(
      cloudSessionFailureReason({ conclusion: "failure" }, []),
      "Cloud session provisioning failed.",
    );
    assert.notEqual(cloudSessionFailureReason({ conclusion: "failure" }, null), "failure");
  });
});

describe("projectCloudSession failure reason", () => {
  it.effect("reads a failed run's steps once and serves the cached reason after", () =>
    Effect.gen(function* () {
      const gh = fakeGh(JOBS_WITH_FAILED_STEP);
      const cache = makeFailureReasonCache();

      const first = yield* projectCloudSession(failedRun, 0, "machine", repoRef, gh.run, cache);
      const second = yield* projectCloudSession(failedRun, 0, "machine", repoRef, gh.run, cache);

      assert.equal(first.phase, "failed");
      assert.equal(first.failureReason, "Failed at “Start t3 serve and wait for pairing details”.");
      assert.equal(second.failureReason, first.failureReason);
      // Settled runs are final: one jobs read for the lifetime of the cache.
      assert.equal(gh.calls.length, 1);
    }),
  );

  it.effect("retries an unreadable read a bounded number of times, then pins the reason", () =>
    Effect.gen(function* () {
      const gh = fakeGh("not json");
      const cache = makeFailureReasonCache();

      const session = yield* projectCloudSession(failedRun, 0, "machine", repoRef, gh.run, cache);
      for (let poll = 0; poll < 5; poll += 1) {
        yield* projectCloudSession(failedRun, 0, "machine", repoRef, gh.run, cache);
      }

      assert.equal(session.failureReason, "Cloud session provisioning failed.");
      // A flaky read is retried, but a permanent one stops costing a call per poll.
      assert.equal(gh.calls.length, 3);
    }),
  );

  it.effect("spends no jobs read on a run that settled cleanly", () =>
    Effect.gen(function* () {
      const gh = fakeGh(JOBS_WITH_FAILED_STEP);
      const stopped = { ...failedRun, conclusion: "success" };

      const session = yield* projectCloudSession(stopped, 0, "machine", repoRef, gh.run);

      assert.equal(session.phase, "stopped");
      assert.equal(session.failureReason, null);
      assert.equal(gh.calls.length, 0);
    }),
  );
});

describe("workflowHistoryUrl", () => {
  it("points at the session workflow's runs, filtered to the caller", () => {
    assert.equal(
      workflowHistoryUrl(repoRef, "pj"),
      "https://nexplore.ghe.com/hive/nx-nexi/actions/workflows/session.yml?query=actor%3Apj",
    );
  });
});
