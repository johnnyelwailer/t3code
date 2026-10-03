import * as Schema from "effect/Schema";

import { TrimmedNonEmptyString } from "./baseSchemas.ts";

/**
 * A project's machine: what a cloud session builds for it, defined once per project and shared
 * through the repository (issue #562 in the distribution). "Machine", not "environment": an
 * environment here is a running T3 server, which the machine hosts once it is built. The definition itself is a
 * standard `devcontainer.json`, so the same file also works in VS Code and Codespaces; the
 * committed `.nexi/machine.json` points at it and carries what devcontainers have no field for
 * (a health check, the secrets the machine needs — by name only).
 */

/** The committed pointer file, relative to the repository root. */
export const PROJECT_MACHINE_FILE_PATH = ".nexi/machine.json";

/** Where a devcontainer is looked for when no pointer file names one (the spec's own locations). */
export const DEVCONTAINER_CANDIDATE_PATHS = [
  ".devcontainer/devcontainer.json",
  ".devcontainer.json",
] as const;

/**
 * A path inside the repository: relative, forward slashes, no `..` segment. A pointer that escapes
 * the repository would make a session read files the definition's reviewers never saw.
 */
export const RepositoryRelativePath = TrimmedNonEmptyString.check(
  Schema.isMaxLength(512),
  Schema.isPattern(/^(?!\/)(?![A-Za-z]:)(?!.*\\)(?!(?:.*\/)?\.\.(?:\/|$)).+$/),
);
export type RepositoryRelativePath = typeof RepositoryRelativePath.Type;

/**
 * Who provides a secret's value. `user`: each person's own, kept in their local secret store and
 * handed to their own session. `team`: one shared value, stored as a secret on the repository that
 * holds the definition and read from there only for names listed here.
 */
export const ProjectMachineSecretScope = Schema.Literals(["user", "team"]);
export type ProjectMachineSecretScope = typeof ProjectMachineSecretScope.Type;

/** A secret the machine needs, exposed to it as an environment variable of the same name. */
export const ProjectMachineSecret = Schema.Struct({
  name: TrimmedNonEmptyString.check(
    Schema.isMaxLength(128),
    // An environment variable name, and a valid GitHub/GHE secret name (which may not start GITHUB_).
    Schema.isPattern(/^(?!GITHUB_)[A-Z_][A-Z0-9_]*$/),
  ),
  scope: ProjectMachineSecretScope,
  /** Shown when the value is asked for: what it is and where to get it. */
  description: Schema.optional(TrimmedNonEmptyString.check(Schema.isMaxLength(500))),
});
export type ProjectMachineSecret = typeof ProjectMachineSecret.Type;

/** `.nexi/machine.json` as committed. Values never appear here, only secret names. */
export const ProjectMachineFile = Schema.Struct({
  version: Schema.Literal(1),
  /** The `devcontainer.json` this machine builds. */
  devcontainer: RepositoryRelativePath,
  /** Run inside the built machine; exit 0 means it is ready to work in. */
  healthCheck: Schema.optional(TrimmedNonEmptyString.check(Schema.isMaxLength(2000))),
  secrets: Schema.optional(Schema.Array(ProjectMachineSecret)),
});
export type ProjectMachineFile = typeof ProjectMachineFile.Type;

/** A definition found in one of the project's repositories. */
export const ProjectMachineDefinition = Schema.Struct({
  /** The repository it was found in: `owner/repo` for a linked repository, `.` for the project's own. */
  repository: TrimmedNonEmptyString,
  devcontainerPath: RepositoryRelativePath,
  /** Null when only a plain devcontainer was found, without a `.nexi/machine.json`. */
  machineFilePath: Schema.NullOr(RepositoryRelativePath),
  healthCheck: Schema.NullOr(TrimmedNonEmptyString),
  secrets: Schema.Array(ProjectMachineSecret),
  /**
   * Content hash over everything the build reads (the pointer, the devcontainer, its Dockerfile
   * and compose files). A session's built image is reused while this is unchanged.
   */
  hash: TrimmedNonEmptyString,
});
export type ProjectMachineDefinition = typeof ProjectMachineDefinition.Type;

/** Where a project's machine stands. Only `ready` has passed its health check on a clean machine. */
export const ProjectMachineStatus = Schema.Union([
  Schema.TaggedStruct("None", {}),
  Schema.TaggedStruct("Detected", { definition: ProjectMachineDefinition }),
  Schema.TaggedStruct("Ready", {
    definition: ProjectMachineDefinition,
    verifiedAt: Schema.String,
  }),
  Schema.TaggedStruct("Broken", {
    definition: ProjectMachineDefinition,
    /** What failed, for the repair thread and the project card: build, health check, or a secret. */
    reason: TrimmedNonEmptyString.check(Schema.isMaxLength(2000)),
  }),
]);
export type ProjectMachineStatus = typeof ProjectMachineStatus.Type;
