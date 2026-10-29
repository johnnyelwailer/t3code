/**
 * What `t3team.machine.find_definitions` answers: machine definitions found in a project's own
 * and linked repositories, where each was found, what was looked at, and what could not be read.
 * No field carries a URL: repositories are `owner/repo`, so a credentialed remote cannot leak.
 *
 * @module t3team-machineDefinitionSearchResult
 */
import * as Schema from "effect/Schema";

const Repository = Schema.String.annotate({ description: "owner/repo" });

const FoundRef = Schema.Struct({
  kind: Schema.Literals(["branch", "pr"]),
  name: Schema.optional(Schema.String),
  number: Schema.optional(Schema.Number),
  state: Schema.Literals(["default", "open", "closed"]).annotate({
    description: "default branch, a live other branch or open PR, or a recently closed PR",
  }),
});

const Candidate = Schema.Struct({
  repository: Repository,
  ref: FoundRef,
  where: Schema.String.annotate({
    description: "default branch | other branch | open PR #n | recently closed PR #n",
  }),
  path: Schema.String,
  kind: Schema.Literals([".nexi/machine.json", "devcontainer"]),
  author: Schema.NullOr(Schema.String),
  summary: Schema.String,
  commit: Schema.String,
});

export const MachineDefinitionSearchResult = Schema.Struct({
  candidates: Schema.Array(Candidate),
  checked: Schema.Array(
    Schema.Struct({
      repository: Repository,
      refs: Schema.Array(Schema.String),
      omitted: Schema.Number.annotate({
        description: "refs past the per-repository cap that were not looked at",
      }),
    }),
  ),
  unreadable: Schema.Array(Schema.Struct({ repository: Repository, reason: Schema.String })),
  setupHints: Schema.Array(
    Schema.Struct({ repository: Repository, ref: FoundRef, path: Schema.String }),
  ),
});
export type MachineDefinitionSearchResult = typeof MachineDefinitionSearchResult.Type;
export type MachineDefinitionCandidate = MachineDefinitionSearchResult["candidates"][number];
