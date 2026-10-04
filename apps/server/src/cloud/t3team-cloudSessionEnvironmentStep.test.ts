import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { ChildProcessSpawner } from "effect/unstable/process";

import {
  ENVIRONMENT_STEP_PREFIX,
  environmentIdFromSteps,
} from "./t3team-cloudSessionEnvironmentStep.ts";
import { projectCloudSession } from "./t3team-CloudSessionProjection.ts";
import type {
  CloudSessionRepoRef,
  WorkflowJobStep,
  WorkflowRunSummary,
} from "./t3team-githubActionsSessionClient.ts";

const ENVIRONMENT_ID = "3f2b9c1e-6d4a-4b8e-9f10-2a7c5d8e1b34";

const GhJobsJson = Schema.Struct({
  jobs: Schema.Array(
    Schema.Struct({
      steps: Schema.Array(
        Schema.Struct({
          name: Schema.String,
          status: Schema.String,
          conclusion: Schema.NullOr(Schema.String),
        }),
      ),
    }),
  ),
});
const encodeGhJobs = Schema.encodeSync(Schema.fromJsonString(GhJobsJson));

const repoRef: CloudSessionRepoRef = {
  host: "ghe.example",
  owner: "hive",
  repo: "nx-nexi",
  workflowFileName: "session.yml",
};

const inProgressRun: WorkflowRunSummary = {
  id: 42,
  status: "in_progress",
  conclusion: null,
  createdAt: "2026-09-27T10:00:00Z",
  updatedAt: "2026-09-27T10:03:00Z",
  htmlUrl: "https://ghe.example/hive/nx-nexi/actions/runs/42",
  name: "nexi-session [s1]",
};

const step = (name: string, status = "completed", conclusion: string | null = "success") => ({
  name,
  status,
  conclusion,
});

const project = (steps: readonly WorkflowJobStep[]) =>
  projectCloudSession(inProgressRun, Date.parse("2026-09-27T10:05:00Z"), "slim", repoRef, () =>
    Effect.succeed({
      exitCode: ChildProcessSpawner.ExitCode(0),
      stdout: encodeGhJobs({ jobs: [{ steps: [...steps] }] }),
      stderr: "",
      stdoutTruncated: false,
      stderrTruncated: false,
    }),
  );

describe("cloud session environment id", () => {
  it.effect("pins the published environment id on a ready session's record", () =>
    Effect.gen(function* () {
      const session = yield* project([
        step("Start t3 serve and wait for pairing details"),
        step("Capture connect status"),
        step(`${ENVIRONMENT_STEP_PREFIX}${ENVIRONMENT_ID}`),
      ]);
      assert.strictEqual(session.phase, "ready");
      assert.strictEqual(session.environmentId, ENVIRONMENT_ID);
    }),
  );

  it.effect("leaves it unset on a ready session whose workflow predates the marker", () =>
    Effect.gen(function* () {
      const session = yield* project([step("Capture connect status")]);
      assert.strictEqual(session.phase, "ready");
      assert.isFalse("environmentId" in session);
    }),
  );

  it.effect("never pins it before the session is ready", () =>
    Effect.gen(function* () {
      const session = yield* project([
        step("Start t3 serve and wait for pairing details", "in_progress", null),
        step(`${ENVIRONMENT_STEP_PREFIX}${ENVIRONMENT_ID}`),
      ]);
      assert.strictEqual(session.phase, "starting");
      assert.isFalse("environmentId" in session);
    }),
  );

  it("ignores unstarted, unrendered, or empty marker names", () => {
    assert.isUndefined(environmentIdFromSteps(null));
    assert.isUndefined(
      environmentIdFromSteps([step(`${ENVIRONMENT_STEP_PREFIX}${ENVIRONMENT_ID}`, "queued", null)]),
    );
    assert.isUndefined(
      environmentIdFromSteps([step(`${ENVIRONMENT_STEP_PREFIX}\${{ env.NEXI_ENVIRONMENT_ID }}`)]),
    );
    assert.isUndefined(environmentIdFromSteps([step(ENVIRONMENT_STEP_PREFIX)]));
  });
});
