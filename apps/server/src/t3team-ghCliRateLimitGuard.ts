import type { VcsError } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import * as GitHubApi from "./sourceControl/GitHubApi.ts";
import * as GitHubQuota from "./sourceControl/githubQuota.ts";
import * as SourceControlRateLimit from "./sourceControl/SourceControlRateLimit.ts";
import type { VcsProcessInput } from "./vcs/VcsProcess.ts";
import type { VcsProcessShape } from "./t3team-vcsProcessShape.ts";
import { VcsProcess } from "./vcs/VcsProcess.ts";

const DEFAULT_HOST = "github.com";
const FLAGS_WITH_VALUE = new Set([
  "--hostname",
  "--jq",
  "-q",
  "--method",
  "-X",
  "--header",
  "-H",
  "--field",
  "-F",
  "--raw-field",
  "-f",
  "--input",
  "--template",
  "-t",
  "--cache",
  "--preview",
  "-p",
]);

/** The host and REST path of a `gh api` call; null for any other command. */
export function ghApiTarget(input: Pick<VcsProcessInput, "command" | "args">) {
  if (input.command !== "gh" || input.args[0] !== "api") return null;
  let host = DEFAULT_HOST;
  let path = "";
  for (let index = 1; index < input.args.length; index++) {
    const arg = input.args.at(index) ?? "";
    if (arg === "--hostname") host = input.args.at(index + 1) ?? DEFAULT_HOST;
    if (arg.startsWith("--hostname=")) host = arg.slice("--hostname=".length) || DEFAULT_HOST;
    if (FLAGS_WITH_VALUE.has(arg)) index++;
    else if (!arg.startsWith("-") && path === "") path = arg;
  }
  return { host: host.trim().toLowerCase(), path };
}

const isRateLimited = (error: VcsError) =>
  error._tag === "VcsProcessExitError" && error.failureKind === "rate-limited";

/**
 * Makes a `gh api` call obey the same rate-limit pause and quota as `GitHubApi`: refused up front
 * while the host is paused or its quota is at the reserve, and a rate-limited answer starts (or
 * extends) the pause for everyone. The CLI prints no quota headers here, so only the pause and
 * the balance `GitHubApi` already observed are consulted; a refusal falls back to the
 * pause's own cooldown. With no credential to scope the pause by, the call passes through. Everything that is not `gh api` passes straight through.
 */
export function guardGhApiProcess(
  vcs: VcsProcessShape,
  deps: {
    readonly api: GitHubApi.GitHubApi["Service"];
    readonly limits: SourceControlRateLimit.SourceControlRateLimit["Service"];
    readonly quota: GitHubQuota.GitHubQuota["Service"];
  },
): VcsProcessShape {
  const guarded = (
    input: VcsProcessInput,
    target: { readonly host: string; readonly path: string },
    key: { readonly provider: "github"; readonly host: string },
  ) =>
    Effect.gen(function* () {
      yield* deps.quota.admit(target.host, GitHubQuota.restResourceOf(target.path));
      const lease = yield* deps.limits.check(key);
      return yield* vcs.run(input).pipe(
        Effect.tap(() => deps.limits.recordSuccess({ ...key, lease })),
        Effect.tapError((error) =>
          error._tag === "SourceControlRateLimitPausedError" || !isRateLimited(error)
            ? Effect.void
            : deps.limits.recordRateLimit({ ...key, lease }),
        ),
      );
    });

  return {
    run: (input) => {
      const target = ghApiTarget(input);
      if (target === null) return vcs.run(input);
      const key = { provider: "github" as const, host: target.host };
      return deps.api.credential(target.host).pipe(
        Effect.map((credential) => credential.fingerprint),
        Effect.option,
        Effect.flatMap((fingerprint) =>
          Option.isNone(fingerprint)
            ? vcs.run(input)
            : guarded(input, target, key).pipe(
                Effect.provideService(SourceControlRateLimit.CredentialScope, fingerprint.value),
              ),
        ),
      );
    },
  };
}

/** The process runner for the legacy GitHub routes: the real one, guarded. */
export const guardedGitHubProcess = Effect.gen(function* () {
  return guardGhApiProcess(yield* VcsProcess, {
    api: yield* GitHubApi.GitHubApi,
    limits: yield* SourceControlRateLimit.SourceControlRateLimit,
    quota: yield* GitHubQuota.GitHubQuota,
  });
});
