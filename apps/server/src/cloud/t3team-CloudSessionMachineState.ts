/**
 * The delete flow's git plumbing: one git call, one resume-branch fetch, and the user's
 * credential for the host, handed to t3team-CloudSessionMachineCheckout. Every call runs as
 * the user, so a machine is only removable when this desktop can reach its project's remote
 * as the user; a failure here blocks the delete instead of doing it partially.
 */
import { CloudSessionFailedError } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";

import * as GitHubApi from "@t3tools/source-control-github/server/t3team-GitHubApi";
import * as VcsProcessModule from "../vcs/VcsProcess.ts";
import {
  CHECK_REF,
  deleteMachineCheckout,
  unreachable,
  type CheckoutGit,
  type MachineCheckoutInput,
} from "./t3team-CloudSessionMachineCheckout.ts";

/** Fetch and push against a remote: slower than a local read, but still far from a job. */
const GIT_TIMEOUT_MS = 90_000;

export interface MachineStateOperations {
  /**
   * Remove the machine's persistent checkout state. Answers the branch the unpushed work was
   * saved to, or null when the machine carried none. Nothing is removed before the work is
   * saved: a save that fails blocks the whole delete.
   */
  readonly deleteMachineCheckout: (
    input: MachineCheckoutInput,
  ) => Effect.Effect<{ readonly wipBranch: string | null }, CloudSessionFailedError>;
}

export const makeMachineStateOperations = Effect.fn("cloud.session_machine_state.make")(function* (
  vcs: VcsProcessModule.VcsProcess["Service"],
  api: GitHubApi.GitHubApi["Service"],
) {
  const credentialFor = (host: string): Effect.Effect<string | null, CloudSessionFailedError> =>
    api.credential(host).pipe(
      Effect.map(({ token }) => Redacted.value(token).trim()),
      Effect.map((token) => (token.length > 0 ? token : null)),
      Effect.mapError(() => unreachable()),
    );

  const git = (
    cwd: string,
    args: ReadonlyArray<string>,
    token: string | null,
    host: string,
  ): Effect.Effect<
    { readonly ok: boolean; readonly stdout: string; readonly stderr: string },
    CloudSessionFailedError
  > =>
    vcs
      .run({
        operation: "cloudSession.machineState",
        command: "git",
        args,
        cwd,
        allowNonZeroExit: true,
        timeoutMs: GIT_TIMEOUT_MS,
        ...(token === null
          ? {}
          : {
              env: {
                GIT_CONFIG_COUNT: "1",
                GIT_CONFIG_KEY_0: `http.${host}/.extraHeader`,
                GIT_CONFIG_VALUE_0: `authorization: Bearer ${token}`,
              },
            }),
      })
      .pipe(
        Effect.map((out) => ({
          ok: out.exitCode === 0,
          stdout: out.stdout.trim(),
          stderr: out.stderr.trim(),
        })),
        Effect.mapError(() => unreachable()),
      );

  /**
   * Fetch the resume branch into `CHECK_REF`. Answers the tip sha, or null when the branch
   * does not exist on the remote (the machine's checkout was never preserved: nothing to
   * save, nothing to remove).
   */
  const fetchResumeBranch = (
    cwd: string,
    remote: string,
    branch: string,
    token: string | null,
    host: string,
    scratch: boolean,
  ): Effect.Effect<string | null, CloudSessionFailedError> =>
    git(
      cwd,
      [
        "fetch",
        "--quiet",
        ...(scratch ? ["--filter=blob:none"] : []),
        remote,
        `+refs/heads/${branch}:${CHECK_REF}`,
      ],
      token,
      host,
    ).pipe(
      Effect.flatMap((out) => {
        const absent = /couldn't find remote ref|remote ref does not exist/i.test(out.stderr);
        if (absent) return Effect.succeed(null);
        if (!out.ok) return Effect.fail(unreachable());
        return git(cwd, ["rev-parse", CHECK_REF], token, host).pipe(
          Effect.flatMap((tip) =>
            tip.ok ? Effect.succeed(tip.stdout) : Effect.fail(unreachable()),
          ),
        );
      }),
    );

  const plumbing: CheckoutGit = {
    run: git,
    fetchResumeBranch,
    credentialFor,
  };

  const operations: MachineStateOperations = {
    deleteMachineCheckout: (input) => deleteMachineCheckout(plumbing, input),
  };
  return operations;
});
