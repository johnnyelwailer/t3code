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
 * `integration.read` was initially left unmapped on the assumption that reads already worked from the
 * thread defaults. That was WRONG, and a live run proved it: told to read the parent epic, children,
 * comments and links first, the agent instead ran shell commands hunting for the work item on disk and
 * found nothing. `t3team.work_item.read_view_state`, `read_description` and `read_attachment` are
 * `kind: "read"` on the **work-item** surface, so — exactly like the draft tool — they are absent from
 * `DEFAULT_T3TEAM_THREAD_TOOL_IDS`, which is the `thread` surface. A tool the agent cannot see is a tool
 * it will improvise around.
 *
 * Same discipline for both: a thread gains these only while launching a workflow that declares the group.
 */
const TOOL_GROUP_CATALOG_KINDS: Record<string, string> = {
  "integration.read": "read",
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
