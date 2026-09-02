/**
 * Interim capability gate for which t3team tools a thread's project may use. This is NOT
 * the tool policy engine described in Epic 32
 * (docs/t3team-mvp/32-project-provider-tool-policies.md) — that epic adds provider identity,
 * tool-group allow/deny/approval, pack merge order, and locks. `resolveT3TeamThreadToolIds`
 * below is the single entry point call sites should use, so Epic 32 can replace its *body*
 * without touching any caller. Surface taxonomy is defined by the existing catalog
 * (docs/t3team-mvp/21-context-tool-catalog.md, packages/project-context/src/t3teamToolCatalogCore.ts).
 */
import type { ProjectSource } from "@t3tools/project-context";
import {
  getT3TeamToolDefinition,
  requiresWorkSourceT3TeamTool,
  type T3TeamToolId,
} from "@t3tools/project-context/t3teamToolCatalog";

import { isWorkProjectSource } from "~/t3team/t3team-isWorkProject";

/**
 * ANY work-source surface disqualifies the tool, not all of them — see
 * `requiresWorkSourceT3TeamTool`'s own docstring (packages/project-context/src/t3teamToolCatalogCore.ts)
 * for why "any" rather than "every". Kept as a thin wrapper here so every call site in this file
 * still reads `requiresWorkSource(toolId)` rather than a two-step catalog lookup.
 */
function requiresWorkSource(toolId: T3TeamToolId): boolean {
  return requiresWorkSourceT3TeamTool(getT3TeamToolDefinition(toolId));
}

export function resolveT3TeamThreadToolIds<TToolId extends T3TeamToolId>(input: {
  // Absent for call sites that don't yet have the project's source at hand — treated as
  // "unknown, don't restrict" so those callers keep today's unfiltered behavior.
  readonly projectSource: Pick<ProjectSource, "provider"> | undefined;
  readonly candidateToolIds: ReadonlyArray<TToolId>;
}): ReadonlyArray<TToolId> {
  if (!input.projectSource || isWorkProjectSource(input.projectSource)) {
    return input.candidateToolIds;
  }

  return input.candidateToolIds.filter((toolId) => !requiresWorkSource(toolId));
}
