import { type CloudSession, CloudSessionFailedError } from "@t3tools/contracts";
import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { ChildProcessSpawner } from "effect/unstable/process";

import type * as VcsProcess from "../vcs/VcsProcess.ts";
import {
  makePayloadIssueCleanup,
  parseCreatedPayloadIssue,
  SCRUBBED_PAYLOAD_BODY,
} from "./t3team-CloudSessionPayloadCleanup.ts";
import type {
  CloudSessionRepoRef,
  GhInvocation,
  WorkflowRunSummary,
} from "./t3team-githubActionsSessionClient.ts";

const repoRef: CloudSessionRepoRef = {
  host: "ghe.example",
  owner: "hive",
  repo: "nx-nexi",
  workflowFileName: "session.yml",
};

const PatchJson = Schema.Struct({ state: Schema.String, body: Schema.String });
const decodePatch = Schema.decodeSync(Schema.fromJsonString(PatchJson));
const CreatedIssueJson = Schema.Struct({ number: Schema.Finite, node_id: Schema.String });
const encodeCreatedIssue = Schema.encodeSync(Schema.fromJsonString(CreatedIssueJson));

const ok: VcsProcess.VcsProcessOutput = {
  exitCode: ChildProcessSpawner.ExitCode(0),
  stdout: "{}",
  stderr: "",
  stdoutTruncated: false,
  stderrTruncated: false,
};

/** Records every gh call; `failDelete` makes the GraphQL delete refuse (no admin). */
const makeGh = (options: { failDelete?: boolean } = {}) => {
  const calls: GhInvocation[] = [];
  const run = (invocation: GhInvocation) =>
    Effect.suspend(() => {
      calls.push(invocation);
      return options.failDelete && invocation.args.includes("graphql")
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
      const args = gh.calls[0]?.args ?? [];
      assert.include(args.join(" "), "deleteIssue");
      assert.include(args, `issueId=${issue.nodeId}`);
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
      assert.include(patch?.args ?? [], "repos/hive/nx-nexi/issues/12");
      assert.include(patch?.args ?? [], "PATCH");
      assert.deepStrictEqual(decodePatch(patch?.stdin ?? "{}"), {
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
