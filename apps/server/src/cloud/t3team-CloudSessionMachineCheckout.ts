// @effect-diagnostics nodeBuiltinImport:off - the delete's scratch repository needs direct fs calls; its git I/O goes through VcsProcess.
/**
 * The delete's removal of a machine's persistent checkout: save the unpushed work the
 * resume branch carries to a `wip/` branch, then remove the branch. The plumbing (`run`, the
 * branch listing and fetch, the host credential) comes from t3team-CloudSessionMachineState.
 * A save that fails blocks the whole delete; nothing is removed before the work is saved.
 */
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { CloudSessionFailedError } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import {
  resumeBranchName,
  resumeTipHasUnpushedWork,
  wipBranchName,
} from "./t3team-CloudSessionDelete.ts";

/** A temporary ref in the checkout the check runs in; removed when the delete ends. */
export const CHECK_REF = "refs/nexi/delete-check";

export const unreachable = () =>
  new CloudSessionFailedError({
    reason: "unreachable",
    message: "The project's remote could not be reached; the machine was not changed.",
  });

const refuse = (message: string) =>
  new CloudSessionFailedError({ reason: "delete_blocked", message });

/** A `nexi-resume/<snapshot owner>/<workspace>` branch on the project's remote. */
export interface ResumeBranch {
  readonly owner: string;
  readonly branch: string;
  readonly sha: string;
}

export interface CheckoutGit {
  readonly run: (
    cwd: string,
    args: ReadonlyArray<string>,
    token: string | null,
    host: string,
  ) => Effect.Effect<
    { readonly ok: boolean; readonly stdout: string; readonly stderr: string },
    CloudSessionFailedError
  >;
  /** Every owner's resume branch of `workspace` on the remote; fails when it cannot be listed. */
  readonly listResumeBranches: (
    cwd: string,
    remote: string,
    workspace: string,
    token: string | null,
    host: string,
  ) => Effect.Effect<ReadonlyArray<ResumeBranch>, CloudSessionFailedError>;
  /** Fetch `branch` into `CHECK_REF` and answer its tip; fails when it cannot. */
  readonly fetchBranch: (
    cwd: string,
    remote: string,
    branch: string,
    token: string | null,
    host: string,
    scratch: boolean,
  ) => Effect.Effect<string, CloudSessionFailedError>;
  readonly credentialFor: (host: string) => Effect.Effect<string | null, CloudSessionFailedError>;
}

export interface MachineCheckoutInput {
  /** Repository host the credential is for, e.g. "nexplore.ghe.com". */
  readonly host: string;
  readonly owner: string;
  readonly name: string;
  /** This desktop's checkout of the repository, when it has one; null uses a scratch repo. */
  readonly localRoot: string | null;
  /** The commit the machine was pinned to, from that checkout; null when unknown. */
  readonly pinnedSha: string | null;
  /** session.yml's NEXI_SNAPSHOT_OWNER for the run; null when it cannot be named. */
  readonly snapshotOwner: string | null;
  readonly workspace: string;
  /** The deleted run, which names its wip branch. */
  readonly runId: number;
}

/**
 * Remove the machine's persistent checkout state. Answers the branch the unpushed work was
 * saved to, or null when the remote's listing proves the machine left no resume branch.
 */
export const deleteMachineCheckout = Effect.fn("cloud.session.delete.checkout.remove")(function* (
  git: CheckoutGit,
  input: MachineCheckoutInput,
) {
  const remote = `https://${input.host}/${input.owner}/${input.name}`;
  const token = yield* git.credentialFor(input.host);
  const scratch = input.localRoot === null;
  // Without a checkout on this desktop the delete works in a scratch repository instead.
  const cwd =
    input.localRoot !== null
      ? input.localRoot
      : yield* Effect.sync(() =>
          NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "nexi-delete-")),
        );
  // The local checkout talks to its own `origin`; the scratch repository has none.
  const target = scratch ? remote : "origin";

  try {
    if (scratch) {
      const init = yield* git.run(cwd, ["init", "--quiet"], token, input.host);
      if (!init.ok) return yield* unreachable();
    }
    const branches = yield* git.listResumeBranches(cwd, target, input.workspace, token, input.host);
    if (input.snapshotOwner === null) {
      if (branches.length === 0) return { wipBranch: null as string | null };
      return yield* refuse(
        `This machine's owner cannot be identified, so its resume branch (${branches[0]!.branch}) was left alone. Stop it, or check that branch.`,
      );
    }
    const branch = resumeBranchName(input.snapshotOwner, input.workspace);
    const listed = branches.find((entry) => entry.branch === branch);
    if (listed === undefined) return { wipBranch: null as string | null };

    const tip = yield* git.fetchBranch(cwd, target, branch, token, input.host, scratch);
    if (tip.toLowerCase() !== listed.sha.toLowerCase()) {
      return yield* refuse(`${branch} changed while it was being deleted. Try again.`);
    }

    let wipBranch: string | null = null;
    if (resumeTipHasUnpushedWork(tip, input.pinnedSha)) {
      const wip = wipBranchName(input.workspace, input.runId);
      // Never forced: an existing wip branch with other work blocks the delete instead.
      const saved = yield* git.run(
        cwd,
        ["push", "--quiet", target, `${CHECK_REF}:refs/heads/${wip}`],
        token,
        input.host,
      );
      if (!saved.ok) {
        return yield* refuse(
          `The machine's unpushed work could not be saved to ${wip} first, so the delete was not done: ${saved.stderr.slice(0, 200)}`,
        );
      }
      wipBranch = wip;
    }

    // The lease removes exactly the tip that was saved; a push since then fails it.
    const removed = yield* git.run(
      cwd,
      [
        "push",
        "--quiet",
        `--force-with-lease=refs/heads/${branch}:${tip}`,
        target,
        `:refs/heads/${branch}`,
      ],
      token,
      input.host,
    );
    if (!removed.ok) {
      return yield* refuse(
        `The resume branch ${branch} could not be removed${wipBranch !== null ? ` (the work is saved on ${wipBranch})` : ""}: ${removed.stderr.slice(0, 200)}`,
      );
    }
    return { wipBranch };
  } finally {
    if (input.localRoot !== null) {
      // Best effort: a failed ref cleanup must not mask the delete's own result.
      yield* git
        .run(input.localRoot, ["update-ref", "-d", CHECK_REF], null, "")
        .pipe(Effect.asVoid, Effect.ignore);
    }
    if (input.localRoot === null) {
      // The scratch directory dies with the machine's reboot; a delete that already
      // succeeded must not fail on its cleanup.
      yield* Effect.sync(() => {
        try {
          NodeFS.rmSync(cwd, { recursive: true, force: true });
        } catch {
          // A delete that already succeeded must not fail on its cleanup.
        }
      });
    }
  }
});
