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
  deleteMachineCheckout,
  unreachable,
  type CheckoutGit,
  type MachineCheckoutInput,
  type ResumeBranch,
} from "./t3team-CloudSessionMachineCheckout.ts";

/** Fetch and push against a remote: slower than a local read, but still far from a job. */
const GIT_TIMEOUT_MS = 90_000;

/** Which repository and workspace to list resume branches of. */
export type ResumeBranchQuery = Pick<
  MachineCheckoutInput,
  "host" | "owner" | "name" | "localRoot" | "workspace"
>;

export interface MachineStateOperations {
  /** Every owner's resume branch of the workspace on the repository's remote. */
  readonly listResumeBranches: (
    query: ResumeBranchQuery,
  ) => Effect.Effect<ReadonlyArray<ResumeBranch>, CloudSessionFailedError>;
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

  /** `git ls-remote` of every owner's resume branch of `workspace`; a failed listing fails. */
  const listResumeBranches: CheckoutGit["listResumeBranches"] = (
    cwd,
    remote,
    workspace,
    token,
    host,
  ) =>
    git(
      cwd,
      ["ls-remote", "--heads", remote, `refs/heads/nexi-resume/*/${workspace}`],
      token,
      host,
    ).pipe(
      Effect.flatMap((out) =>
        out.ok
          ? Effect.succeed(parseResumeBranches(out.stdout, workspace))
          : Effect.fail(unreachable()),
      ),
    );

  /** Fetch `branch` into the delete's own `ref` and answer its tip. */
  const fetchBranch: CheckoutGit["fetchBranch"] = (
    cwd,
    remote,
    branch,
    ref,
    token,
    host,
    scratch,
  ) =>
    git(
      cwd,
      [
        "fetch",
        "--quiet",
        ...(scratch ? ["--filter=blob:none"] : []),
        remote,
        `+refs/heads/${branch}:${ref}`,
      ],
      token,
      host,
    ).pipe(
      Effect.flatMap((out) =>
        out.ok ? git(cwd, ["rev-parse", ref], token, host) : Effect.fail(unreachable()),
      ),
      Effect.flatMap((tip) => (tip.ok ? Effect.succeed(tip.stdout) : Effect.fail(unreachable()))),
    );

  const plumbing: CheckoutGit = {
    run: git,
    listResumeBranches,
    fetchBranch,
    credentialFor,
  };

  const operations: MachineStateOperations = {
    listResumeBranches: (query) =>
      credentialFor(query.host).pipe(
        Effect.flatMap((token) =>
          listResumeBranches(
            query.localRoot ?? ".",
            `https://${query.host}/${query.owner}/${query.name}`,
            query.workspace,
            token,
            query.host,
          ),
        ),
      ),
    deleteMachineCheckout: (input) => deleteMachineCheckout(plumbing, input),
  };
  return operations;
});

/** `<sha> refs/heads/nexi-resume/<owner>/<workspace>` lines, exactly this workspace's. */
export function parseResumeBranches(
  stdout: string,
  workspace: string,
): ReadonlyArray<ResumeBranch> {
  return stdout.split("\n").flatMap((line) => {
    const [sha, ref] = line.trim().split(/\s+/);
    const match = /^refs\/heads\/(nexi-resume\/([^/]+)\/(.+))$/.exec(ref ?? "");
    if (sha === undefined || match === null || match[3] !== workspace) return [];
    return [{ owner: match[2]!, branch: match[1]!, sha }];
  });
}
