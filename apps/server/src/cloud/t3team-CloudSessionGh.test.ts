import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";

import * as GitHubApi from "../sourceControl/GitHubApi.ts";
import { makeSessionGh } from "./t3team-CloudSessionGh.ts";
import { type CloudSessionRepoRef } from "./t3team-githubActionsSessionClient.ts";

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
      const gh = makeSessionGh(mockApi(rest), REPO);

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
});
