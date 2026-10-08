/**
 * Resolves what a cloud session needs to run in a project's machine (issue #562): the project's
 * default definition (`t3team-ProjectMachineDiscovery`), pinned to a commit the session can fetch,
 * plus the user's own token for that repository's host. The session clones as the user; nothing
 * here involves an app identity.
 *
 * A pinned commit must hold exactly the definition the user sees: HEAD when it is on a remote
 * branch, else the upstream tip — and the definition's files must be committed and unchanged from
 * that commit. Anything else fails with the step that fixes it, never a silent plain session.
 *
 * @module t3team-CloudSessionMachine
 */
import { CloudSessionFailedError, type ProjectId } from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

import { ProjectMachineDiscovery } from "../project/t3team-ProjectMachineDiscovery.ts";
import * as GitHubCli from "../sourceControl/GitHubCli.ts";
import { VcsProcess } from "../vcs/VcsProcess.ts";
import {
  type MachineGitAuthor,
  type MachineRepository,
  machineGitAuthor,
  machineRepositoryFromRemote,
  standbyPoolKey,
} from "./t3team-cloudSessionMachineNames.ts";

export interface CloudSessionMachine {
  readonly repository: MachineRepository;
  readonly commit: string;
  readonly devcontainerPath: string;
  /** Run inside the machine once it is up; a failure fails the session. Null when none. */
  readonly healthCheck: string | null;
  /** The user's token for `repository.host`; travels only to the broker, as a session secret. */
  readonly token: string;
  /** The user's commit identity, so the machine's commits carry their name like their pushes do. */
  readonly author: MachineGitAuthor;
  /** Team secret names from `.nexi/machine.json`. Values stay on the repository. */
  readonly teamSecretNames: ReadonlyArray<string>;
}

/** A project with no machine yet: the session clones it on the host so an agent can write one. */
export interface CloudSessionSetup {
  readonly repository: MachineRepository;
  readonly commit: string;
  readonly token: string;
  readonly author: MachineGitAuthor;
}

const unavailable = (message: string) =>
  new CloudSessionFailedError({ reason: "machine_unavailable", message });

const SHA = /^[0-9a-f]{40}$/;
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

export class CloudSessionMachines extends Context.Service<
  CloudSessionMachines,
  {
    /** Null when the project has no machine: the session is a plain one. */
    readonly resolve: (
      projectId: ProjectId,
    ) => Effect.Effect<CloudSessionMachine | null, CloudSessionFailedError>;
    /**
     * The checkout a setup session clones. Fails when the project already has a machine, or when
     * its branch is not on `origin` yet.
     */
    readonly resolveSetup: (
      projectId: ProjectId,
    ) => Effect.Effect<CloudSessionSetup, CloudSessionFailedError>;
    /**
     * The project's warm pool (`<owner>.<repo>`) when it has a usable machine definition and an
     * https origin, else null. Needs no sign-in: it only reads the checkout.
     */
    readonly poolKeyOf: (projectId: ProjectId) => Effect.Effect<string | null>;
  }
>()("t3/cloud/t3team-CloudSessionMachine/CloudSessionMachines") {}

const make = Effect.gen(function* () {
  const discovery = yield* ProjectMachineDiscovery;
  const vcs = yield* VcsProcess;
  const github = yield* GitHubCli.GitHubCli;

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
      if (!sha.ok || !SHA.test(sha.stdout)) continue;
      const onRemote = yield* git(root, "machine.remoteContains", [
        "branch",
        "-r",
        "--list",
        "origin/*",
        "--contains",
        sha.stdout,
      ]);
      if (onRemote.ok && onRemote.stdout.length > 0) return sha.stdout;
    }
    return null;
  });

  const resolve = Effect.fn("cloud.session_machine.resolve")(function* (projectId: ProjectId) {
    const { discovery: found, source } = yield* discovery
      .resolveDefault(projectId)
      .pipe(Effect.mapError((error) => unavailable(error.message)));
    if (source === null) {
      const broken = found.rejected[0];
      if (broken === undefined) return null;
      return yield* unavailable(`${broken.path} cannot be used: ${broken.reason}`);
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

    const creds = yield* credentials(root, repository);
    return {
      repository,
      commit,
      devcontainerPath: machine.devcontainerPath,
      healthCheck: machine.healthCheck,
      teamSecretNames: machine.secrets
        .filter((secret) => secret.scope === "team")
        .map((secret) => secret.name),
      ...creds,
    } satisfies CloudSessionMachine;
  });

  const credentials = Effect.fn("cloud.session_machine.credentials")(function* (
    root: string,
    repository: MachineRepository,
  ) {
    const token = yield* github
      .execute({
        cwd: root,
        args: ["auth", "token", "--hostname", repository.host],
        timeoutMs: 15_000,
      })
      .pipe(
        Effect.map((out) => out.stdout.trim()),
        Effect.orElseSucceed(() => ""),
      );
    if (token.length === 0) {
      return yield* new CloudSessionFailedError({
        reason: "repository_sign_in_required",
        message: `Sign in to ${repository.host} with gh (gh auth login --hostname ${repository.host}) so the session can clone ${repository.owner}/${repository.name}.`,
      });
    }
    const profile = yield* github
      .execute({
        cwd: root,
        args: ["api", "--hostname", repository.host, "user"],
        timeoutMs: 15_000,
      })
      .pipe(
        Effect.flatMap((out) => decodeProfile(out.stdout)),
        Effect.mapError(
          () =>
            new CloudSessionFailedError({
              reason: "repository_sign_in_required",
              message: `Could not read your ${repository.host} profile with gh; sign in again (gh auth login --hostname ${repository.host}).`,
            }),
        ),
      );
    return { token, author: machineGitAuthor(profile, repository.host) };
  });

  const resolveSetup = Effect.fn("cloud.session_machine.resolve_setup")(function* (
    projectId: ProjectId,
  ) {
    const found = yield* discovery
      .resolveDefault(projectId)
      .pipe(Effect.mapError((error) => unavailable(error.message)));
    if (found.source !== null) {
      return yield* unavailable(
        "This project already has a machine. Start a cloud session to use it.",
      );
    }
    const broken = found.discovery.rejected[0];
    if (broken !== undefined) {
      return yield* unavailable(`${broken.path} cannot be used: ${broken.reason}`);
    }
    const checkout = found.checkouts[0];
    if (checkout === undefined) {
      return yield* unavailable("This project has no repository to set a machine up in.");
    }
    const origin = yield* git(checkout.root, "machine.origin", ["remote", "get-url", "origin"]);
    const repository = origin.ok ? machineRepositoryFromRemote(origin.stdout) : null;
    if (repository === null) {
      return yield* unavailable(
        "This project has no origin remote a cloud session can clone over https.",
      );
    }
    const commit = yield* pinnedCommit(checkout.root);
    if (commit === null) {
      return yield* unavailable(
        "Push this project's branch so the setup machine can check it out.",
      );
    }
    const creds = yield* credentials(checkout.root, repository);
    return { repository, commit, ...creds } satisfies CloudSessionSetup;
  });

  const poolKeyOf = (projectId: ProjectId) =>
    Effect.gen(function* () {
      const { source } = yield* discovery.resolveDefault(projectId);
      if (source === null) return null;
      const origin = yield* git(source.root, "machine.origin", ["remote", "get-url", "origin"]);
      const repository = origin.ok ? machineRepositoryFromRemote(origin.stdout) : null;
      return repository === null ? null : standbyPoolKey(repository);
    }).pipe(Effect.orElseSucceed(() => null));

  return CloudSessionMachines.of({ resolve, resolveSetup, poolKeyOf });
});

export const layer = Layer.effect(CloudSessionMachines, make);
