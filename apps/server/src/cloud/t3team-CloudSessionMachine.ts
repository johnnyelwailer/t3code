/**
 * Resolves a project's own machine (never a linked repository's) at a fetchable commit with the
 * user's credentials.
 * Local definitions must be committed and pushed; remote definitions retain the exact scanned
 * default-branch commit. Invalid definitions block launch, while unavailable remote discovery
 * falls back to a plain session. Standby and plain resolution only consult the remote cache.
 * CLOUD_PROJECT_MACHINE gates machine selection and remote work.
 *
 * @module t3team-CloudSessionMachine
 */
import { isRevisionSha } from "@t3tools/source-control-core/server/t3team-fileAtRevision";
import {
  CloudSessionFailedError,
  plainProjectFolderName,
  type ProjectId,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { ProjectMachineDiscovery } from "../project/t3team-ProjectMachineDiscovery.ts";
import { OWN_REPOSITORY } from "../project/t3team-projectMachineOwnership.ts";
import { logMachineOutcome } from "./t3team-cloudSessionMachineLog.ts";
import { machineRepositoryAccess } from "./t3team-cloudMachineRepository.ts";
import { readFeatureFlagFromConfig } from "../t3team-featureFlagConfig.ts";
import {
  type MachineGitAuthor,
  type MachineRepository,
  machineRepositoryFromRemote,
  standbyPoolKey,
} from "./t3team-cloudSessionMachineNames.ts";
import type { CloudSessionPlainProject } from "./t3team-cloudSessionPlainProject.ts";

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
     * https origin, else null. Reads local checkouts and cached remote results only.
     */
    readonly poolKeyOf: (projectId: ProjectId) => Effect.Effect<string | null>;
    /**
     * What a plain session (no machine) runs in: the project's own repository when it has an
     * https-reachable `origin`, else an empty workspace named after the project. Fails when the
     * origin cannot be cloned, nothing of the branch is pushed, or the user is not signed in.
     */
    readonly resolvePlain: (
      projectId: ProjectId,
    ) => Effect.Effect<CloudSessionPlainProject, CloudSessionFailedError>;
  }
>()("t3/cloud/t3team-CloudSessionMachine/CloudSessionMachines") {}

const make = Effect.gen(function* () {
  const discovery = yield* ProjectMachineDiscovery;
  const { git, pinnedCommit, credentials, pinSource } = yield* machineRepositoryAccess();

  const resolve = Effect.fn("cloud.session_machine.resolve")(function* (projectId: ProjectId) {
    if (!(yield* readFeatureFlagFromConfig("CLOUD_PROJECT_MACHINE"))) return null;
    const {
      discovery: found,
      source,
      ignoredRepositories,
    } = yield* discovery
      .resolveDefault(projectId)
      .pipe(Effect.mapError((error) => unavailable(error.message)));
    if (source === null) {
      const broken = found.rejected[0];
      if (broken === undefined) {
        yield* logMachineOutcome(projectId, { outcome: "plain", ignoredRepositories });
        return null;
      }
      yield* logMachineOutcome(projectId, { outcome: "rejected", rejected: broken.path });
      return yield* unavailable(`${broken.path} cannot be used: ${broken.reason}`);
    }
    const { machine } = source;
    const unusable = (error: CloudSessionFailedError) =>
      logMachineOutcome(projectId, { outcome: "unusable", reason: error.reason });
    const { repository, commit } = yield* pinSource(source).pipe(Effect.tapError(unusable));
    const creds = yield* credentials(repository).pipe(Effect.tapError(unusable));
    yield* logMachineOutcome(projectId, {
      outcome: "machine",
      repository: `${repository.owner}/${repository.name}`,
    });
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
    // The project's own checkout: a linked repository is not where the project's machine goes.
    const checkout = found.checkouts.find((entry) => entry.repository === OWN_REPOSITORY);
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
    const creds = yield* credentials(repository);
    return { repository, commit, ...creds } satisfies CloudSessionSetup;
  });

  const poolKeyOf = (projectId: ProjectId) =>
    Effect.gen(function* () {
      if (!(yield* readFeatureFlagFromConfig("CLOUD_PROJECT_MACHINE"))) return null;
      const { source } = yield* discovery.resolveDefault(projectId, { remote: "cached-only" });
      if (source === null) return null;
      const origin =
        source.remote === undefined
          ? yield* git(source.root, "machine.origin", ["remote", "get-url", "origin"])
          : { ok: true, stdout: source.remote.url };
      const repository = origin.ok ? machineRepositoryFromRemote(origin.stdout) : null;
      return repository === null ? null : standbyPoolKey(repository);
    }).pipe(Effect.orElseSucceed(() => null));

  const resolvePlain = Effect.fn("cloud.session_machine.resolve_plain")(function* (
    projectId: ProjectId,
  ) {
    const found = yield* discovery
      .resolveDefault(projectId, { remote: "cached-only" })
      .pipe(Effect.mapError((error) => unavailable(error.message)));
    // Only the project's own checkout (its main repository); a linked repository is not the project.
    const own = found.checkouts.find((entry) => entry.repository === OWN_REPOSITORY);
    const origin =
      own === undefined
        ? null
        : yield* git(own.root, "machine.origin", ["remote", "get-url", "origin"]);
    if (own === undefined || origin === null || !origin.ok || origin.stdout.length === 0) {
      return {
        kind: "workspace",
        folder: plainProjectFolderName(found.title, projectId),
        title: found.title,
      } satisfies CloudSessionPlainProject;
    }
    const repository = machineRepositoryFromRemote(origin.stdout);
    if (repository === null) {
      return yield* unavailable(
        "This project's origin remote is not one a cloud session can clone over https.",
      );
    }
    // The user's pushed branch, else the default branch the clone would start on.
    const commit =
      (yield* pinnedCommit(own.root)) ??
      (yield* git(own.root, "machine.defaultBranch", [
        "rev-parse",
        "--verify",
        "--quiet",
        "refs/remotes/origin/HEAD^{commit}",
      ]).pipe(
        Effect.map((out) =>
          out.ok && isRevisionSha(out.stdout) ? out.stdout.toLowerCase() : null,
        ),
      ));
    if (commit === null) {
      return yield* unavailable(
        "Push this project's branch so the cloud session can check it out.",
      );
    }
    const creds = yield* credentials(repository);
    return {
      kind: "checkout",
      checkout: { repository, commit, ...creds },
    } satisfies CloudSessionPlainProject;
  });

  return CloudSessionMachines.of({ resolve, resolveSetup, poolKeyOf, resolvePlain });
});

export const layer = Layer.effect(CloudSessionMachines, make);
