// @effect-diagnostics nodeBuiltinImport:off - the delete's scratch repository needs direct fs calls; its git I/O goes through VcsProcess.
/**
 * The delete's removal of a machine's persistent checkout: save the unpushed work the
 * resume branch carries to a `wip/` branch, then remove the branch. The plumbing (`run`,
 * `fetchResumeBranch`, the host credential) comes from t3team-CloudSessionMachineState.
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

const blocked = (detail: string) =>
  new CloudSessionFailedError({
    reason: "delete_blocked",
    message: `The machine's unpushed work could not be saved to a wip/ branch first, so the delete was not done. ${detail}`,
  });

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
  readonly fetchResumeBranch: (
    cwd: string,
    remote: string,
    branch: string,
    token: string | null,
    host: string,
    scratch: boolean,
  ) => Effect.Effect<string | null, CloudSessionFailedError>;
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
  readonly login: string;
  readonly workspace: string;
}

/**
 * Remove the machine's persistent checkout state. Answers the branch the unpushed work was
 * saved to, or null when the machine carried none.
 */
export const deleteMachineCheckout = Effect.fn("cloud.session.delete.checkout.remove")(function* (
  git: CheckoutGit,
  input: MachineCheckoutInput,
) {
  const branch = resumeBranchName(input.login, input.workspace);
  const wip = wipBranchName(input.workspace);
  const remote = `https://${input.host}/${input.owner}/${input.name}`;
  const token = yield* git.credentialFor(input.host);
  // Without a checkout on this desktop the delete works in a scratch repository instead.
  const cwd =
    input.localRoot !== null
      ? input.localRoot
      : yield* Effect.sync(() =>
          NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "nexi-delete-")),
        );

  try {
    const tipSha = yield* Effect.gen(function* () {
      if (input.localRoot !== null) {
        return yield* git.fetchResumeBranch(
          input.localRoot,
          "origin",
          branch,
          token,
          input.host,
          false,
        );
      }
      const init = yield* git.run(cwd, ["init", "--quiet"], token, input.host);
      if (!init.ok) return yield* unreachable();
      // No local checkout: without the pinned commit the work counts as present —
      // saving needlessly beats deleting it.
      return yield* git.fetchResumeBranch(cwd, remote, branch, token, input.host, true);
    });

    if (tipSha === null) return { wipBranch: null as string | null };

    let wipBranch: string | null = null;
    if (resumeTipHasUnpushedWork(tipSha, input.pinnedSha)) {
      // The local checkout pushes to its own `origin`; the scratch repository has none, so it
      // pushes by URL.
      const pushRemote = input.localRoot !== null ? "origin" : remote;
      const saved = yield* git.run(
        cwd,
        ["push", "--force", "--quiet", pushRemote, `${CHECK_REF}:refs/heads/${wip}`],
        token,
        input.host,
      );
      if (!saved.ok) {
        return yield* blocked(`Saving to ${wip} failed: ${saved.stderr.slice(0, 200)}`);
      }
      wipBranch = wip;
    }

    const removed = yield* git.run(
      cwd,
      input.localRoot !== null
        ? ["push", "--quiet", "origin", `:refs/heads/${branch}`]
        : ["push", "--quiet", remote, `:refs/heads/${branch}`],
      token,
      input.host,
    );
    const gone =
      removed.ok || /remote ref does not exist|couldn't find remote ref/i.test(removed.stderr);
    if (!gone) {
      return yield* new CloudSessionFailedError({
        reason: "delete_blocked",
        message: `The resume branch ${branch} could not be removed${wipBranch !== null ? ` (the work is saved on ${wipBranch})` : ""}: ${removed.stderr.slice(0, 200)}`,
      });
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
