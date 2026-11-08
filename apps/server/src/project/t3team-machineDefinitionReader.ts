import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

export const MAX_DEFINITION_FILE_BYTES = 1024 * 1024;
export class Rejected extends Schema.TaggedError<Rejected>()("Rejected", {
  reason: Schema.String,
}) {}
/** A transport failure says nothing about whether a valid definition exists. */
export class RemoteUnavailable extends Schema.TaggedError<RemoteUnavailable>()(
  "RemoteUnavailable",
  {
    reason: Schema.String,
    cause: Schema.optional(Schema.Defect()),
  },
) {}
/** The user's chosen repository answered `ls-remote` with a refusal: missing, or not readable with their sign-in. */
export class RepositoryRefused extends Schema.TaggedError<RepositoryRefused>()(
  "RepositoryRefused",
  {
    reason: Schema.String,
  },
) {}
/** The user's chosen branch does not exist in the repository. */
export class BranchNotFound extends Schema.TaggedError<BranchNotFound>()("BranchNotFound", {
  branch: Schema.String,
}) {}
export interface MachineDefinitionReader {
  readonly read: (path: string) => Effect.Effect<string | null, Rejected | RemoteUnavailable>;
  readonly nestedPaths: Effect.Effect<ReadonlyArray<string>>;
}
