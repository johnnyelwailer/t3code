import { isRevisionSha } from "@t3tools/source-control-core/server/t3team-fileAtRevision";
import * as Effect from "effect/Effect";
import { CLONE_ENV } from "../sourceControl/SourceControlRepositoryService.ts";
import { VcsProcess } from "../vcs/VcsProcess.ts";
import { RemoteUnavailable } from "./t3team-machineDefinitionReader.ts";

/** No advertised HEAD is normal for an empty repository; malformed output is unavailable. */
export const remoteHead = Effect.fn("projectMachine.remoteDefaultBranch")(function* (input: {
  readonly url: string;
  readonly cwd: string;
}) {
  const vcs = yield* VcsProcess;
  const tip = yield* vcs
    .run({
      operation: "machine.remoteDefaultBranch",
      command: "git",
      args: ["ls-remote", "--symref", "--", input.url, "HEAD"],
      cwd: input.cwd,
      env: CLONE_ENV,
      allowNonZeroExit: true,
      timeoutMs: 15_000,
      maxOutputBytes: 16 * 1024,
    })
    .pipe(
      Effect.mapError(
        (cause) =>
          new RemoteUnavailable({
            reason:
              cause._tag === "VcsProcessTimeoutError"
                ? "Remote discovery timed out."
                : "The remote repository could not be reached.",
            cause,
          }),
      ),
    );
  if (tip.exitCode !== 0)
    return yield* new RemoteUnavailable({
      reason: "The remote repository could not be reached or access was refused.",
    });
  if (tip.stdoutTruncated || tip.stdoutInvalidUtf8)
    return yield* new RemoteUnavailable({ reason: "The remote HEAD response was incomplete." });
  const lines = tip.stdout.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.every((line) => /^ref: refs\/heads\/\S+\s+HEAD$/.test(line))) return null;
  const commit = /^([0-9a-f]+)\s+HEAD\s*$/im.exec(tip.stdout)?.[1];
  if (commit === undefined || !isRevisionSha(commit))
    return yield* new RemoteUnavailable({
      reason: "The remote returned an unsupported HEAD object ID.",
    });
  return commit;
});
