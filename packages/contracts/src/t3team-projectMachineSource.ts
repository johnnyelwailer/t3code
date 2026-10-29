import * as Schema from "effect/Schema";

import { ProjectId, TrimmedNonEmptyString } from "./baseSchemas.ts";

/**
 * Where a project's machine definition is looked for, when the user chose it: a repository and a
 * branch. Both optional: no repository means the project's own, no branch the repository's default.
 * Only names are stored; a repository with credentials in its URL is rejected, so a token can
 * never end up in the setting.
 */
export const ProjectMachineSourceSetting = Schema.Struct({
  /** `https://host/owner/repo(.git)`, or `owner/repo` on the project's own host. */
  repository: Schema.optional(TrimmedNonEmptyString.check(Schema.isMaxLength(300))),
  branch: Schema.optional(TrimmedNonEmptyString.check(Schema.isMaxLength(255))),
});
export type ProjectMachineSourceSetting = typeof ProjectMachineSourceSetting.Type;

/** `source: null` resets to the default (the project's own repository, its default branch). */
export const ProjectMachineSourceSetInput = Schema.Struct({
  projectId: ProjectId,
  source: Schema.NullOr(ProjectMachineSourceSetting),
});
export type ProjectMachineSourceSetInput = typeof ProjectMachineSourceSetInput.Type;

/** Where the machine definition was read from, as shown in the session setup. */
export const ProjectMachineSourceReadout = Schema.Struct({
  /** `owner/repo` on `host`. */
  repository: TrimmedNonEmptyString,
  host: TrimmedNonEmptyString,
  /** Null: the repository's default branch (or the project's checked-out branch). */
  branch: Schema.NullOr(TrimmedNonEmptyString),
  /** The commit a remote scan read; null for a local checkout. */
  commit: Schema.NullOr(TrimmedNonEmptyString),
  /** The user's saved choice, or null for the default. */
  override: Schema.NullOr(ProjectMachineSourceSetting),
});
export type ProjectMachineSourceReadout = typeof ProjectMachineSourceReadout.Type;
