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
  type T3TeamToolId,
  type T3TeamToolSurface,
} from "@t3tools/project-context/t3teamToolCatalog";

import { isWorkProjectSource } from "~/t3team/t3team-isWorkProject";

/**
 * Surfaces that only make sense against a real work source (Jira/Atlassian, Linear, a
 * GitHub-managed project, ...). A loose local workspace has no backlog, no "my work" queue,
 * and no work items behind it.
 */
const WORK_SOURCE_ONLY_SURFACES: ReadonlySet<T3TeamToolSurface> = new Set([
  "backlog",
  "my-work",
  "work-item",
]);

/**
 * ANY work-source surface disqualifies the tool, not all of them.
 *
 * `surfaces` does double duty in the catalog: it names the UI surface a tool belongs to AND
 * acts as the selector for a set (`DEFAULT_T3TEAM_THREAD_TOOL_IDS` is everything tagged
 * `"thread"`). So a work-item tool offered to thread agents is tagged
 * `["work-item", "thread"]` — `t3team.work_item.refresh_context_bundle` is exactly that, and
 * it is the one work-source tool in the default thread set. Requiring *every* surface to be
 * work-source-only would let it through and make this gate a no-op.
 */
function requiresWorkSource(toolId: T3TeamToolId): boolean {
  const tool = getT3TeamToolDefinition(toolId);
  return tool.surfaces.some((surface) => WORK_SOURCE_ONLY_SURFACES.has(surface));
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
