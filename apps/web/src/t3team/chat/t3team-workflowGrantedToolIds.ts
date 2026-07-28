/**
 * The catalog tools a launch thread must expose because the workflow being launched declared them.
 *
 * There are TWO gates on a host tool call and they are set from different places. The run's
 * `host_tool_grant` comes from the recipe manifest's `allowedToolGroups` and is authoritative about
 * what the run MAY do. The thread's synced tool context decides what is actually reachable. When the
 * second is narrower than the first, the run does everything right and then fails at the last step:
 *
 *   Workflow run failed: Tool 't3team.work_item.description.draft_update' is not enabled for this thread.
 *
 * That is what happened to `describe-rewrite`. Its grant persisted as
 * `{"toolGroups":["integration.read","mutation.draft"]}`, but the launch thread's context was built from
 * `DEFAULT_T3TEAM_THREAD_TOOL_IDS` — the `thread`-SURFACE defaults, which do not include any
 * draft-mutation tool (those live on the `work-item` surface). The writer turn produced a real
 * description and then had nowhere to put it.
 *
 * So the declared groups are mapped to catalog tools here and unioned into the thread's selection. This
 * widens nothing on its own: a thread only gains these tools when the workflow it is launching already
 * holds the matching grant, and the server still enforces the grant independently.
 */

import { listImplementedT3TeamToolCatalogEntries } from "@t3tools/project-context/t3teamToolCatalog";

import type { T3TeamThreadToolId } from "~/t3team/t3team-types";

/**
 * Tool group → the catalog `kind` it authorises.
 *
 * Only `mutation.draft` is mapped: it is the group whose absence has been observed to break a run.
 * `integration.read`'s reads already work from the thread defaults, and inventing a mapping for groups
 * with no demonstrated gap would widen thread tool context on a guess.
 */
const TOOL_GROUP_CATALOG_KINDS: Record<string, string> = {
  "mutation.draft": "draft-mutation",
};

export function resolveT3TeamWorkflowGrantedToolIds(
  allowedToolGroups: ReadonlyArray<string> | undefined,
): ReadonlyArray<T3TeamThreadToolId> {
  if (allowedToolGroups === undefined || allowedToolGroups.length === 0) {
    return [];
  }

  const kinds = new Set(
    allowedToolGroups
      .map((group) => TOOL_GROUP_CATALOG_KINDS[group])
      .filter((kind): kind is string => kind !== undefined),
  );
  if (kinds.size === 0) {
    return [];
  }

  return listImplementedT3TeamToolCatalogEntries()
    .filter((tool) => kinds.has(tool.kind))
    .map((tool) => tool.id as T3TeamThreadToolId);
}
