import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";
import * as TestClock from "effect/testing/TestClock";

import * as GitHubApi from "@t3tools/source-control-github/server/t3team-GitHubApi";
import { makeSessionGh } from "./t3team-CloudSessionGh.ts";
import { projectCloudSession } from "./t3team-CloudSessionProjection.ts";
import { makeFailureReasonCache } from "./t3team-cloudSessionFailureReason.ts";
import {
  jobStepsRequest,
  type CloudSessionRepoRef,
  type WorkflowRunSummary,
} from "./t3team-githubActionsSessionClient.ts";

const REPO: CloudSessionRepoRef = {
  host: "nexplore.ghe.com",
  owner: "hive",
  repo: "nx-nexi",
  workflowFileName: "session.yml",
};

const okRest = (body: string): GitHubApi.GitHubRestResponse => ({
  status: 200,
  headers: {},
  body,
  truncated: false,
  invalidUtf8: false,
});

/** `makeSessionGh` only calls `rest`/`graphql`; credential is unused in these tests. */
const mockApi = (rest: GitHubApi.GitHubApi["Service"]["rest"]): GitHubApi.GitHubApi["Service"] => ({
  rest,
  graphql: () => Effect.succeed("{}"),
  credential: () => Effect.succeed({ token: Redacted.make("unused"), fingerprint: "fp" }),
});

describe("makeSessionGh", () => {
  it.effect("list reads leave the quota reserve; interactive runs may spend it", () =>
    Effect.gen(function* () {
      const allowReserveByOperation: Array<{ operation: string; allowReserve: boolean }> = [];
      const rest: GitHubApi.GitHubApi["Service"]["rest"] = (input) =>
        Effect.sync(() => {
          allowReserveByOperation.push({
            operation: input.operation,
            allowReserve: input.allowReserve === true,
          });
          if (input.path === "user") {
            return okRest(JSON.stringify({ login: "pj" }));
          }
          return okRest(JSON.stringify({ workflow_runs: [] }));
        });
      const gh = yield* makeSessionGh(mockApi(rest), REPO);

      yield* gh.resolveLogin({ allowReserve: false });
      yield* gh.listRunsFor("pj", { allowReserve: false });
      yield* gh.runInteractive({
        kind: "rest",
        operation: "cloudSession.cancelRun",
        method: "POST",
        path: "repos/hive/nx-nexi/actions/runs/1/cancel",
      });

      assert.deepStrictEqual(allowReserveByOperation, [
        { operation: "cloudSession.viewer", allowReserve: false },
        { operation: "cloudSession.listRuns", allowReserve: false },
        { operation: "cloudSession.cancelRun", allowReserve: true },
      ]);
    }),
  );

  it.effect("caches job-step reads briefly so list polls share one GHE call", () =>
    Effect.gen(function* () {
      let stepsCalls = 0;
      const rest: GitHubApi.GitHubApi["Service"]["rest"] = (input) =>
        Effect.sync(() => {
          if (input.operation === "cloudSession.jobSteps") stepsCalls += 1;
          return okRest(JSON.stringify({ jobs: [] }));
        });
      const gh = yield* makeSessionGh(mockApi(rest), REPO);
      const request = jobStepsRequest(REPO, 42);

      yield* gh.runBackground(request);
      yield* gh.runBackground(request);
      assert.strictEqual(stepsCalls, 1);

      yield* TestClock.adjust("6 seconds");
      yield* gh.runBackground(request);
      assert.strictEqual(stepsCalls, 2);
    }),
  );

  it.effect("caches the viewer login across list polls", () =>
    Effect.gen(function* () {
      let viewerCalls = 0;
      const rest: GitHubApi.GitHubApi["Service"]["rest"] = (input) =>
        Effect.sync(() => {
          if (input.path === "user") viewerCalls += 1;
          return okRest(JSON.stringify({ login: "pj" }));
        });
      const gh = yield* makeSessionGh(mockApi(rest), REPO);

      assert.strictEqual(yield* gh.resolveLogin({ allowReserve: false }), "pj");
      assert.strictEqual(yield* gh.resolveLogin({ allowReserve: false }), "pj");
      assert.strictEqual(viewerCalls, 1);

      yield* TestClock.adjust("61 seconds");
      assert.strictEqual(yield* gh.resolveLogin({ allowReserve: false }), "pj");
      assert.strictEqual(viewerCalls, 2);
    }),
  );

  it.effect("an unreadable viewer names the host whose identity is missing", () =>
    Effect.gen(function* () {
      const gh = yield* makeSessionGh(
        mockApi(() => Effect.succeed(okRest(JSON.stringify({})))),
        REPO,
      );

      const error = yield* Effect.flip(gh.resolveLogin({ allowReserve: false }));

      assert.strictEqual(error.reason, "unauthorized");
      assert.include(error.message, "nexplore.ghe.com");
    }),
  );

  it.effect(
    "never pins a failure reason from a later attempt's steps (re-run raced the read)",
    () =>
      Effect.gen(function* () {
        const failedAttempt1: WorkflowRunSummary = {
          id: 77,
          status: "completed",
          conclusion: "failure",
          createdAt: "",
          updatedAt: "",
          htmlUrl: "",
          name: "nexi-session [s1]",
          actor: "pj",
          runAttempt: 1,
        };
        const jobs = (attempt: number, step: string) =>
          okRest(
            JSON.stringify({
              jobs: [
                {
                  run_attempt: attempt,
                  steps: [{ name: step, status: "completed", conclusion: "failure" }],
                },
              ],
            }),
          );
        let answer = jobs(2, "step of the re-run");
        let reads = 0;
        const rest: GitHubApi.GitHubApi["Service"]["rest"] = () =>
          Effect.sync(() => {
            reads += 1;
            return answer;
          });
        const gh = yield* makeSessionGh(mockApi(rest), REPO);
        const reasons = makeFailureReasonCache();
        const project = () =>
          projectCloudSession(failedAttempt1, 0, "machine", REPO, gh.runBackground, reasons);

        // The re-run began before the read: its steps must not become attempt 1's reason.
        const raced = yield* project();
        assert.notInclude(raced.failureReason ?? "", "re-run");

        answer = jobs(1, "step of attempt 1");
        const settled = yield* project();
        assert.strictEqual(settled.failureReason, "Failed at “step of attempt 1”.");
        yield* project();
        assert.strictEqual(reads, 2, "attempt 1's own answer is read once, then kept for good");
      }),
  );
});
