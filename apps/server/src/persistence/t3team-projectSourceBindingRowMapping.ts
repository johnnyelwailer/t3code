/**
 * Shared flattened-row <-> `ProjectSourceBinding` union mapping.
 *
 * `t3team_project_source_bindings` stores the binding as plain nullable
 * columns (there is no SQL union type); a `{ provider: "local" }` binding
 * simply has every id column NULL. Both the write path
 * (`Layers/t3team-ProjectionProjectSourceBindings.ts`) and the shell-snapshot
 * read path (`orchestration/Layers/t3team-projectSourceBindingSnapshotRows.ts`)
 * need this exact mapping, so it lives once here rather than drifting in two
 * places.
 */
import type { ProjectSourceBinding, ProjectWorkSourceProvider } from "@t3tools/contracts";

export interface ProjectSourceBindingFlatRow {
  readonly provider: string;
  readonly accountId: string | null;
  readonly externalProjectId: string | null;
  readonly externalProjectKey: string | null;
  readonly externalProjectUrl: string | null;
}

export function toProjectSourceBindingDomain(
  row: ProjectSourceBindingFlatRow,
): ProjectSourceBinding {
  if (row.provider === "local") {
    return { provider: "local" };
  }
  return {
    provider: row.provider as ProjectWorkSourceProvider,
    accountId: row.accountId ?? "",
    externalProjectId: row.externalProjectId ?? "",
    ...(row.externalProjectKey !== null ? { externalProjectKey: row.externalProjectKey } : {}),
    ...(row.externalProjectUrl !== null ? { externalProjectUrl: row.externalProjectUrl } : {}),
  };
}

export function fromProjectSourceBindingDomain(
  source: ProjectSourceBinding,
): ProjectSourceBindingFlatRow {
  if (source.provider === "local") {
    return {
      provider: "local",
      accountId: null,
      externalProjectId: null,
      externalProjectKey: null,
      externalProjectUrl: null,
    };
  }
  return {
    provider: source.provider,
    accountId: source.accountId,
    externalProjectId: source.externalProjectId,
    externalProjectKey: source.externalProjectKey ?? null,
    externalProjectUrl: source.externalProjectUrl ?? null,
  };
}
