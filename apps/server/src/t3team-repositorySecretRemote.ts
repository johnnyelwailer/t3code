/**
 * Resolve the GitHub/GHE host and `owner/name` Actions secrets target from a checkout's origin.
 *
 * @module t3team-repositorySecretRemote
 */
import { normalizeGitRemoteUrl } from "@t3tools/shared/git";
import * as Effect from "effect/Effect";

import * as GitVcsDriver from "./vcs/GitVcsDriver.ts";

export type RepositorySecretRemote = {
  readonly host: string;
  readonly repository: string;
};

/** `origin` fetch URL → `{ host, repository }` (`owner/name`), or a caller sentence. */
export const resolveRepositorySecretRemote = Effect.fn("resolveRepositorySecretRemote")(function* (
  cwd: string,
) {
  const git = yield* GitVcsDriver.GitVcsDriver;
  const result = yield* git
    .execute({
      operation: "repositorySecret.origin",
      cwd,
      args: ["remote", "get-url", "origin"],
      allowNonZeroExit: true,
      timeoutMs: 10_000,
    })
    .pipe(
      Effect.mapError(
        (error): string => `Could not read origin for this checkout: ${error.message}`,
      ),
    );
  if (result.exitCode !== 0) {
    return yield* Effect.fail(
      `This checkout has no origin remote, so repository secrets cannot be set (${result.stderr.trim() || result.stdout.trim() || `exit ${result.exitCode}`}).`,
    );
  }
  const key = normalizeGitRemoteUrl(result.stdout.trim());
  const segments = key.split("/").filter((segment) => segment.length > 0);
  if (segments.length < 3) {
    return yield* Effect.fail(
      `Origin URL did not yield a host and owner/name repository (${result.stdout.trim()}).`,
    );
  }
  const [host, ...path] = segments;
  // GitHub-family Actions secrets are always owner/name (last two path segments).
  const repository = path.slice(-2).join("/");
  if (!host || repository.split("/").length !== 2) {
    return yield* Effect.fail(
      `Origin URL did not yield a host and owner/name repository (${result.stdout.trim()}).`,
    );
  }
  return { host, repository } satisfies RepositorySecretRemote;
});
