/**
 * Pins local machine definitions to pushed commits and preserves the revision of remote scans.
 * Repository credentials and commit identity belong to the user starting the cloud session.
 *
 * @module t3team-cloudMachineRepository
 */
import { isRevisionSha } from "@t3tools/source-control-core/server/t3team-fileAtRevision";
import { CloudSessionFailedError } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";
import * as GitHubApi from "@t3tools/source-control-github/server/t3team-GitHubApi";
import { VcsProcess } from "../vcs/VcsProcess.ts";
import type { ProjectMachineSource } from "../project/t3team-ProjectMachineDiscovery.ts";
import { machineGitAuthor, type MachineRepository } from "@t3tools/shared/t3team-cloudSessionWorkspace";
import { machineRepositoryFromRemote } from "./t3team-cloudSessionMachineNames.ts";
const unavailable = (message: string) =>
  new CloudSessionFailedError({ reason: "machine_unavailable", message });

const decodeProfile = Schema.decodeUnknownEffect(
  Schema.fromJsonString(
    Schema.Struct({
      login: Schema.String,
      id: Schema.Number,
      name: Schema.optional(Schema.NullOr(Schema.String)),
      email: Schema.optional(Schema.NullOr(Schema.String)),
    }),
  ),
);

export const machineRepositoryAccess = Effect.fn("cloud.machineRepositoryAccess")(function* () {
  const vcs = yield* VcsProcess;
  const api = yield* GitHubApi.GitHubApi;
  const git = (cwd: string, operation: string, args: ReadonlyArray<string>) =>
    vcs
      .run({ operation, command: "git", args, cwd, allowNonZeroExit: true, timeoutMs: 15_000 })
      .pipe(
        Effect.map((out) => ({ ok: out.exitCode === 0, stdout: out.stdout.trim() })),
        Effect.orElseSucceed(() => ({ ok: false, stdout: "" })),
      );

  /**
   * HEAD when an `origin` branch already has it, else the upstream tip; null when neither. Only
   * `origin` counts: it is the remote the session clones. (Read from local tracking refs, so a
   * force-push nobody fetched yet can still slip through; the session then fails its fetch loudly.)
   */
  const pinnedCommit = Effect.fn("cloud.session_machine.pin")(function* (root: string) {
    for (const rev of ["HEAD", "@{upstream}"]) {
      const sha = yield* git(root, "machine.revParse", [
        "rev-parse",
        "--verify",
        "--quiet",
        `${rev}^{commit}`,
      ]);
      if (!sha.ok || !isRevisionSha(sha.stdout)) continue;
      const onRemote = yield* git(root, "machine.remoteContains", [
        "branch",
        "-r",
        "--list",
        "origin/*",
        "--contains",
        sha.stdout,
      ]);
      if (onRemote.ok && onRemote.stdout.length > 0) return sha.stdout.toLowerCase();
    }
    return null;
  });

  const credentials = Effect.fn("cloud.session_machine.credentials")(function* (
    repository: MachineRepository,
  ) {
    // The user's own credential for the repository host: the session clones and pushes as them.
    const token = yield* api.credential(repository.host).pipe(
      Effect.map(({ token: value }) => Redacted.value(value).trim()),
      Effect.orElseSucceed(() => ""),
    );
    if (token.length === 0) {
      return yield* new CloudSessionFailedError({
        reason: "repository_sign_in_required",
        message: `Sign in to ${repository.host} with gh (gh auth login --hostname ${repository.host}) so the session can clone ${repository.owner}/${repository.name}.`,
        host: repository.host,
      });
    }
    const profile = yield* api
      .rest({ host: repository.host, operation: "cloudSession.machineViewer", path: "user" })
      .pipe(
        Effect.flatMap((response) => decodeProfile(response.body)),
        Effect.mapError(
          () =>
            new CloudSessionFailedError({
              reason: "repository_sign_in_required",
              message: `Could not read your ${repository.host} profile; sign in again (gh auth login --hostname ${repository.host}).`,
              host: repository.host,
            }),
        ),
      );
    return { token, author: machineGitAuthor(profile, repository.host) };
  });

  const pinSource = Effect.fn("cloud.pinMachineSource")(function* (source: ProjectMachineSource) {
    if (source.remote !== undefined) {
      const repository = machineRepositoryFromRemote(source.remote.url);
      if (repository === null)
        return yield* unavailable("The remote machine repository cannot be cloned over https.");
      return { repository, commit: source.remote.commit };
    }
    const { root, machine } = source;
    const where = machine.repository === "." ? "the project" : machine.repository;

    const origin = yield* git(root, "machine.origin", ["remote", "get-url", "origin"]);
    const repository = origin.ok ? machineRepositoryFromRemote(origin.stdout) : null;
    if (repository === null) {
      return yield* unavailable(
        `${where} has no origin remote a cloud session can clone over https.`,
      );
    }
    const dirty = yield* git(root, "machine.status", [
      "status",
      "--porcelain",
      "--",
      ...machine.files,
    ]);
    if (!dirty.ok || dirty.stdout.length > 0) {
      return yield* unavailable(
        `Commit and push the machine definition in ${where} first (${machine.files.join(", ")}).`,
      );
    }
    const commit = yield* pinnedCommit(root);
    const same =
      commit === null
        ? false
        : (yield* git(root, "machine.diff", [
            "diff",
            "--quiet",
            commit,
            "HEAD",
            "--",
            ...machine.files,
          ])).ok;
    if (commit === null || !same) {
      return yield* unavailable(
        `Push ${where}'s branch so the session can check out its machine definition.`,
      );
    }

    return { repository, commit };
  });
  return { git, pinnedCommit, credentials, pinSource };
});
