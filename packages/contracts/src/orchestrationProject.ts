import * as Schema from "effect/Schema";

import { IsoDateTime, ProjectId, TrimmedNonEmptyString } from "./baseSchemas.ts";
import { RepositoryIdentity, ThreadEnvMode } from "./environment.ts";
import { ModelSelection } from "./modelSelection.ts";
import { ProjectIconOverride, ProjectScript } from "./project.ts";
import { ProjectMainRepository } from "./t3team-projectMainRepository.ts";
import { ProjectSourceBinding } from "./t3team-orchestrationExt.ts";

/** Project summary shared by the V2 shell and application project APIs. */
export const OrchestrationProjectShell = Schema.Struct({
  id: ProjectId,
  title: TrimmedNonEmptyString,
  workspaceRoot: TrimmedNonEmptyString,
  repositoryIdentity: Schema.optional(Schema.NullOr(RepositoryIdentity)),
  defaultModelSelection: Schema.NullOr(ModelSelection),
  // Per-project override for where new threads start. Null/absent means
  // "no override": clients fall back to t3.json, then the global setting.
  defaultThreadEnvMode: Schema.optional(Schema.NullOr(ThreadEnvMode)),
  // Opt-in because background sync performs network I/O and may move the checkout.
  // Optional on the wire so cached snapshots from older servers still decode.
  autoPull: Schema.optional(Schema.Boolean),
  // Optional on the wire so cached snapshots from older servers still decode.
  faviconPath: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  projectIcon: Schema.optional(Schema.NullOr(ProjectIconOverride)),
  // Optional: the repository whose checkout is `workspaceRoot` (t3team main repository).
  mainRepository: Schema.optional(Schema.NullOr(ProjectMainRepository)),
  scripts: Schema.Array(ProjectScript),
  // t3team: the project's work-source binding (display only; fork table, absent = none).
  source: Schema.optional(ProjectSourceBinding),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type OrchestrationProjectShell = typeof OrchestrationProjectShell.Type;
