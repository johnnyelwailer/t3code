import { assert, describe, it } from "@effect/vitest";
import { CloudSessionFailedError } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import {
  type CheckoutGit,
  type MachineCheckoutInput,
  type ResumeBranch,
  deleteMachineCheckout,
} from "./t3team-CloudSessionMachineCheckout.ts";
import { parseResumeBranches } from "./t3team-CloudSessionMachineState.ts";

const OWNER = "g1283972";
const WORKSPACE = "m-pj.acme.api_";
const OURS = `nexi-resume/${OWNER}/${WORKSPACE}`;
const TIP = "b".repeat(40);

const input = (over: Partial<MachineCheckoutInput> = {}): MachineCheckoutInput => ({
  host: "nexplore.ghe.com",
  owner: "acme",
  name: "api",
  localRoot: "D:/projects/api",
  pinnedSha: "a".repeat(40),
  snapshotOwner: OWNER,
  workspace: WORKSPACE,
  runId: 999,
  ...over,
});

/** A remote holding `branches`; every git call is recorded, and `failing` calls answer not-ok. */
const fakeGit = (
  branches: ReadonlyArray<ResumeBranch>,
  failing: (args: string) => boolean = () => false,
) => {
  const calls: string[] = [];
  const git: CheckoutGit = {
    run: (_cwd, args) =>
      Effect.sync(() => {
        const joined = args.join(" ");
        calls.push(joined);
        return { ok: !failing(joined), stdout: "", stderr: failing(joined) ? "rejected" : "" };
      }),
    listResumeBranches: (_cwd, _remote, workspace) =>
      Effect.succeed(branches.filter((branch) => branch.branch.endsWith(`/${workspace}`))),
    fetchBranch: (_cwd, _remote, branch) =>
      Effect.sync(() => {
        calls.push(`fetch ${branch}`);
        return branches.find((entry) => entry.branch === branch)?.sha ?? "";
      }),
    credentialFor: () => Effect.succeed("token"),
  };
  return { git, calls };
};

const failureOf = <A>(effect: Effect.Effect<A, CloudSessionFailedError>) => Effect.flip(effect);

describe("parseResumeBranches", () => {
  it("reads every owner's branch of exactly this workspace from ls-remote", () => {
    const stdout = [
      `${TIP}\trefs/heads/${OURS}`,
      `${"c".repeat(40)}\trefs/heads/nexi-resume/o${"0".repeat(32)}/${WORKSPACE}`,
      `${"d".repeat(40)}\trefs/heads/nexi-resume/${OWNER}/${WORKSPACE}x`,
      "",
    ].join("\n");
    assert.deepEqual(parseResumeBranches(stdout, WORKSPACE), [
      { owner: OWNER, branch: OURS, sha: TIP },
      {
        owner: `o${"0".repeat(32)}`,
        branch: `nexi-resume/o${"0".repeat(32)}/${WORKSPACE}`,
        sha: "c".repeat(40),
      },
    ]);
  });
});

describe("deleteMachineCheckout", () => {
  it.effect(
    "saves the work to a per-run wip branch without force, then removes the branch under a lease",
    () =>
      Effect.gen(function* () {
        const { git, calls } = fakeGit([{ owner: OWNER, branch: OURS, sha: TIP }]);
        const result = yield* deleteMachineCheckout(git, input());
        assert.equal(result.wipBranch, "wip/nexi-m-pj.acme.api-999");
        const push = calls.find((call) => call.includes("refs/heads/wip/"));
        assert.equal(
          push,
          "push --quiet origin refs/nexi/delete-check:refs/heads/wip/nexi-m-pj.acme.api-999",
        );
        assert.include(
          calls,
          `push --quiet --force-with-lease=refs/heads/${OURS}:${TIP} origin :refs/heads/${OURS}`,
        );
        assert.isFalse(calls.some((call) => call.includes("--force ") || call.endsWith("--force")));
      }),
  );

  it.effect(
    "finds the branch session.yml pushed under the snapshot owner, not the GitHub login",
    () =>
      Effect.gen(function* () {
        const { git, calls } = fakeGit([{ owner: OWNER, branch: OURS, sha: TIP }]);
        yield* deleteMachineCheckout(git, input());
        assert.include(calls, `fetch ${OURS}`);
        assert.isFalse(calls.some((call) => call.includes("nexi-resume/pj/")));
      }),
  );

  it.effect(
    "answers 'nothing saved' only when the remote listing proves the owner has no branch",
    () =>
      Effect.gen(function* () {
        const other = `nexi-resume/g42/${WORKSPACE}`;
        const { git, calls } = fakeGit([{ owner: "g42", branch: other, sha: TIP }]);
        const result = yield* deleteMachineCheckout(git, input());
        assert.isNull(result.wipBranch);
        assert.isFalse(calls.some((call) => call.startsWith("push")));
      }),
  );

  it.effect("blocks when the owner is unknown and the workspace has a resume branch", () =>
    Effect.gen(function* () {
      const { git, calls } = fakeGit([{ owner: OWNER, branch: OURS, sha: TIP }]);
      const error = yield* failureOf(deleteMachineCheckout(git, input({ snapshotOwner: null })));
      assert.equal(error.reason, "delete_blocked");
      assert.isFalse(calls.some((call) => call.startsWith("push")));
    }),
  );

  it.effect(
    "succeeds with an unknown owner only when the workspace has no resume branch at all",
    () =>
      Effect.gen(function* () {
        const { git } = fakeGit([]);
        const result = yield* deleteMachineCheckout(git, input({ snapshotOwner: null }));
        assert.isNull(result.wipBranch);
      }),
  );

  it.effect("blocks when the fetched tip is not the listed one (the branch moved)", () =>
    Effect.gen(function* () {
      const { git, calls } = fakeGit([{ owner: OWNER, branch: OURS, sha: TIP }]);
      const moved: CheckoutGit = { ...git, fetchBranch: () => Effect.succeed("c".repeat(40)) };
      const error = yield* failureOf(deleteMachineCheckout(moved, input()));
      assert.equal(error.reason, "delete_blocked");
      assert.isFalse(calls.some((call) => call.startsWith("push")));
    }),
  );

  it.effect("blocks, removing nothing, when the wip branch already holds other work", () =>
    Effect.gen(function* () {
      const { git, calls } = fakeGit([{ owner: OWNER, branch: OURS, sha: TIP }], (args) =>
        args.includes("refs/heads/wip/"),
      );
      const error = yield* failureOf(deleteMachineCheckout(git, input()));
      assert.equal(error.reason, "delete_blocked");
      assert.isFalse(calls.some((call) => call.includes(`:refs/heads/${OURS}`)));
    }),
  );

  it.effect("blocks when the lease fails (another run pushed after the listing)", () =>
    Effect.gen(function* () {
      const { git } = fakeGit([{ owner: OWNER, branch: OURS, sha: TIP }], (args) =>
        args.includes("--force-with-lease"),
      );
      const error = yield* failureOf(deleteMachineCheckout(git, input()));
      assert.equal(error.reason, "delete_blocked");
      assert.include(error.message, "wip/nexi-m-pj.acme.api-999");
    }),
  );
});
