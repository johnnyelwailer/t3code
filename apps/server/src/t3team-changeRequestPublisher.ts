/**
 * Publish named files from a checkout as a change request: commit ONLY the listed paths onto the
 * branch with the user's own git identity, without switching the checkout or touching its index
 * (`t3team-changeRequestCommit.ts`), push the branch to origin, and open the change request
 * through the source-control provider of the repository's host (`GitManager.openChangeRequest`).
 * Re-running is safe: it adds to the branch, and an open change request for the branch is pushed
 * to and returned, never duplicated.
 *
 * Transports — the `t3team.change_request.publish` broker tool and a workflow body's `getTools()`
 * — only decode, call {@link T3TeamChangeRequestPublisher.publish}, and map these errors.
 *
 * @module t3team-changeRequestPublisher
 */
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import * as GitManager from "./git/GitManager.ts";
import { makeCommitPathsOnBranch } from "./t3team-changeRequestCommit.ts";
import { changeRequestPathsProblem } from "./t3team-changeRequestPaths.ts";
import {
  ChangeRequestNotSignedInError,
  ChangeRequestNothingToCommitError,
  type ChangeRequestPublishError,
  type ChangeRequestPublishInput,
  ChangeRequestPublishInputError,
  type ChangeRequestPublishResult,
  ChangeRequestPushRejectedError,
  isSignInFailure,
} from "./t3team-changeRequestPublishErrors.ts";
import * as GitVcsDriver from "./vcs/GitVcsDriver.ts";
import * as WorkspacePaths from "./workspace/WorkspacePaths.ts";

export class T3TeamChangeRequestPublisher extends Context.Service<
  T3TeamChangeRequestPublisher,
  {
    readonly publish: (
      input: ChangeRequestPublishInput,
    ) => Effect.Effect<ChangeRequestPublishResult, ChangeRequestPublishError>;
  }
>()("t3/t3team-changeRequestPublisher/T3TeamChangeRequestPublisher") {}

const REMOTE_NAME = "origin";

const make = Effect.gen(function* () {
  const git = yield* GitVcsDriver.GitVcsDriver;
  const gitManager = yield* GitManager.GitManager;
  const workspacePaths = yield* WorkspacePaths.WorkspacePaths;
  const commitPathsOnBranch = yield* makeCommitPathsOnBranch;

  const succeeds = (operation: string, cwd: string, args: ReadonlyArray<string>) =>
    git
      .execute({ operation, cwd, args, allowNonZeroExit: true, timeoutMs: 10_000 })
      .pipe(Effect.map((result) => result.exitCode === 0));

  const requireText = (field: string, value: string) =>
    value.trim().length > 0
      ? Effect.succeed(value.trim())
      : Effect.fail(new ChangeRequestPublishInputError({ field, problem: "it is empty." }));

  const publish = Effect.fn("T3TeamChangeRequestPublisher.publish")(function* (
    input: ChangeRequestPublishInput,
  ) {
    const branch = yield* requireText("branch", input.branch);
    const commitMessage = yield* requireText("commitMessage", input.commitMessage);
    const title = yield* requireText("title", input.title);
    const pathsProblem = changeRequestPathsProblem(input.paths);
    if (pathsProblem !== undefined) {
      return yield* new ChangeRequestPublishInputError({ field: "paths", problem: pathsProblem });
    }

    const root = (yield* git.execute({
      operation: "T3TeamChangeRequestPublisher.root",
      cwd: input.cwd,
      args: ["rev-parse", "--show-toplevel"],
    })).stdout.trim();
    const paths: string[] = [];
    for (const relativePath of input.paths) {
      const resolved = yield* workspacePaths.resolveRelativePathWithinRoot({
        workspaceRoot: root,
        relativePath,
      });
      if (!paths.includes(resolved.relativePath)) paths.push(resolved.relativePath);
    }
    if (
      !(yield* succeeds("T3TeamChangeRequestPublisher.branchName", root, [
        "check-ref-format",
        "--branch",
        branch,
      ]))
    ) {
      return yield* new ChangeRequestPublishInputError({
        field: "branch",
        problem: `'${branch}' is not a valid branch name.`,
      });
    }

    // A path git cannot stage (no such file, or ignored) is the caller's to fix, named by git.
    const stageable = yield* git.execute({
      operation: "T3TeamChangeRequestPublisher.stageable",
      cwd: root,
      args: ["--literal-pathspecs", "add", "--dry-run", "-A", "--", ...paths],
      allowNonZeroExit: true,
    });
    if (stageable.exitCode !== 0) {
      const said = stageable.stderr.trim().split("\n")[0] ?? "";
      return yield* new ChangeRequestPublishInputError({ field: "paths", problem: said });
    }
    const committed = yield* commitPathsOnBranch({
      root,
      branch,
      remoteName: REMOTE_NAME,
      paths,
      message: commitMessage,
    });
    if (committed === null) return yield* new ChangeRequestNothingToCommitError({ branch });

    const ref = `refs/heads/${branch}`;
    yield* git
      .execute({
        operation: "T3TeamChangeRequestPublisher.push",
        cwd: root,
        args: ["push", "-u", REMOTE_NAME, `${ref}:${ref}`],
        timeoutMs: null,
      })
      .pipe(
        Effect.catchTags({
          GitCommandError: (cause) =>
            Effect.fail(
              cause.reason === "authentication_failed"
                ? new ChangeRequestNotSignedInError({
                    step: "push",
                    host: REMOTE_NAME,
                    detail:
                      "Git has no working credential for it: sign in through a credential helper or add an SSH key, then run again.",
                  })
                : new ChangeRequestPushRejectedError({ branch, remoteName: REMOTE_NAME, cause }),
            ),
        }),
      );
    const opened = yield* gitManager
      .openChangeRequest({
        cwd: root,
        branch,
        baseBranch: input.base?.trim() || undefined,
        title,
        body: input.body,
        draft: input.draft,
      })
      .pipe(
        Effect.mapError((error) =>
          error._tag === "SourceControlProviderError" && isSignInFailure(error)
            ? new ChangeRequestNotSignedInError({
                step: "open",
                host: error.provider,
                detail: error.detail,
              })
            : error,
        ),
      );
    return {
      url: opened.url,
      number: opened.number,
      repository: opened.repository,
      provider: opened.provider,
      branch,
      commit: committed.commit,
      projectId: input.projectId,
    } satisfies ChangeRequestPublishResult;
  });

  return T3TeamChangeRequestPublisher.of({ publish });
});

export const layer = Layer.effect(T3TeamChangeRequestPublisher, make);
