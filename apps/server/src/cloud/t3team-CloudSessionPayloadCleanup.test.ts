import { type CloudSession, CloudSessionFailedError } from "@t3tools/contracts";
import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import {
  makePayloadIssueCleanup,
  parseCreatedPayloadIssue,
  SCRUBBED_PAYLOAD_BODY,
} from "./t3team-CloudSessionPayloadCleanup.ts";
import type {
  CloudSessionRepoRef,
  GitHubActionsRequest,
  WorkflowRunSummary,
} from "./t3team-githubActionsSessionClient.ts";

const repoRef: CloudSessionRepoRef = {
  host: "ghe.example",
  owner: "hive",
  repo: "nx-nexi",
  workflowFileName: "session.yml",
};

const CreatedIssueJson = Schema.Struct({ number: Schema.Finite, node_id: Schema.String });
const encodeCreatedIssue = Schema.encodeSync(Schema.fromJsonString(CreatedIssueJson));

const ok = { body: "{}", truncated: false };

/** Records every request; `failDelete` makes the GraphQL delete refuse (no admin). */
const makeGh = (options: { failDelete?: boolean } = {}) => {
  const calls: GitHubActionsRequest[] = [];
  const run = (request: GitHubActionsRequest) =>
    Effect.suspend(() => {
      calls.push(request);
      return options.failDelete && request.kind === "graphql"
        ? Effect.fail(new CloudSessionFailedError({ reason: "rejected", message: "no admin" }))
        : Effect.succeed(ok);
    });
  return { calls, run };
};

const entry = (tag: string, phase: CloudSession["phase"]) => ({
  run: { id: 7, name: `hive/nx-nexi [main] [${tag}]` } as WorkflowRunSummary,
  session: { phase } as CloudSession,
});

const issue = { number: 12, nodeId: "I_kwDOAAAB" };

describe("cloud session payload issue cleanup", () => {
  it.effect("deletes the payload once its session is ready, exactly once", () =>
    Effect.gen(function* () {
      const gh = makeGh();
      const cleanup = yield* makePayloadIssueCleanup(repoRef, gh.run);
      yield* cleanup.track("s1", issue);

      // Still provisioning: the VM has not read the payload yet — keep it.
      yield* cleanup.sweep([entry("s1", "preparing")]);
      assert.strictEqual(gh.calls.length, 0);

      yield* cleanup.sweep([entry("s1", "ready")]);
      yield* cleanup.sweep([entry("s1", "ready")]);
      assert.strictEqual(gh.calls.length, 1);
      const deletion = gh.calls[0];
      assert.strictEqual(deletion?.kind, "graphql");
      if (deletion?.kind !== "graphql") return;
      assert.include(deletion.query, "deleteIssue");
      assert.deepStrictEqual(deletion.variables, { issueId: issue.nodeId });
    }),
  );

  it.effect("falls back to close + scrub when the delete is refused", () =>
    Effect.gen(function* () {
      const gh = makeGh({ failDelete: true });
      const cleanup = yield* makePayloadIssueCleanup(repoRef, gh.run);
      yield* cleanup.track("s2", issue);

      // A run that failed before reading its payload must not leave it open.
      yield* cleanup.sweep([entry("s2", "failed")]);
      assert.strictEqual(gh.calls.length, 2);
      const patch = gh.calls[1];
      assert.strictEqual(patch?.kind, "rest");
      if (patch?.kind !== "rest") return;
      assert.strictEqual(patch.path, "repos/hive/nx-nexi/issues/12");
      assert.strictEqual(patch.method, "PATCH");
      assert.deepStrictEqual(patch.body, {
        state: "closed",
        body: SCRUBBED_PAYLOAD_BODY,
      });
    }),
  );

  it.effect("never touches a payload another dispatch owns", () =>
    Effect.gen(function* () {
      const gh = makeGh();
      const cleanup = yield* makePayloadIssueCleanup(repoRef, gh.run);
      yield* cleanup.track("s3", issue);
      yield* cleanup.sweep([entry("s30", "ready")]);
      assert.strictEqual(gh.calls.length, 0);
    }),
  );

  it("reads number and node id from the create response", () => {
    assert.deepStrictEqual(
      parseCreatedPayloadIssue(encodeCreatedIssue({ number: 12, node_id: "I_kwDOAAAB" })),
      issue,
    );
    assert.isNull(parseCreatedPayloadIssue("not json"));
    assert.isNull(parseCreatedPayloadIssue("{}"));
  });
});
