/**
 * Opt-in thread tools: the catalog tools that are `defaultEnabled: false` (today
 * `t3team.change_request.publish`). A thread does not get one by default; it gains one when
 *
 *  - a user selects it for the thread (the thread's synced tool context),
 *  - the host's feature flag for the tool is on, for a thread that has no synced tool context
 *    (a plain cloud session, or any MCP-only provider): the flag is the user's host-level opt-in
 *    (Settings → Features), so a tool it advertises must also be callable, or
 *  - the workflow BODY of a recipe that declares the tool's group calls it (a one-call grant in
 *    `t3team-workflowHostTools.ts`). That grant deliberately does not extend to agent turns on the
 *    same thread: the recipe decides when a change request opens (`machine-setup` asks the user
 *    first), so an agent holding the tool for the whole run could bypass the question.
 *
 * @module t3team-threadOptInTools
 */
import {
  findFeatureFlag,
  readFeatureFlag,
  type FeatureFlagKey,
  type ReadFeatureFlagEnv,
} from "@t3tools/project-context/t3teamFeatureFlags";
import { listT3TeamToolCatalogEntries } from "@t3tools/project-context/t3teamToolCatalog";
import { getProjectRecipeToolGroupForToolId } from "@t3tools/project-recipes";

/** Opt-in tools a host feature flag opens on threads without a synced tool context. */
const FLAG_FOR_OPT_IN_TOOL: ReadonlyMap<string, FeatureFlagKey> = new Map([
  ["t3team.change_request.publish", "AGENTS_CHANGE_REQUEST_PUBLISH"],
  ["t3team.desktop_route.request", "AGENTS_DESKTOP_ROUTE"],
  // Default-enabled in the catalog; here so a thread without a synced context still holds it while the flag is on.
  ["t3team.view.read", "AGENTS_VIEW_CONTEXT"],
]);

/** Catalog tools a thread does not get by default, with the tool group that classifies each. */
export function listOptInThreadTools(): ReadonlyArray<{
  readonly toolId: string;
  readonly group: string | undefined;
}> {
  return listT3TeamToolCatalogEntries({ status: "implemented", surface: "thread" })
    .filter((tool) => tool.defaultEnabled === false)
    .map((tool) => ({ toolId: tool.id, group: getProjectRecipeToolGroupForToolId(tool.id) }));
}

/**
 * `baseToolIds` plus the opt-in tools whose host flag is on. Read on every bind, so toggling the
 * flag takes effect on the next call, like the MCP list the flag also gates.
 */
export function withFlaggedOptInTools(
  baseToolIds: ReadonlyArray<string>,
  readEnv?: ReadFeatureFlagEnv,
): ReadonlyArray<string> {
  const flagged = [...FLAG_FOR_OPT_IN_TOOL].filter(
    ([toolId, flag]) => !baseToolIds.includes(toolId) && readFeatureFlag(flag, readEnv),
  );
  return flagged.length === 0 ? baseToolIds : [...baseToolIds, ...flagged.map(([id]) => id)];
}

/** What enables `toolId` on a thread that refused it; `undefined` for a tool that is not opt-in. */
export function optInToolEnableHint(toolId: string): string | undefined {
  const tool = listOptInThreadTools().find((candidate) => candidate.toolId === toolId);
  if (tool === undefined) return undefined;
  const flag = FLAG_FOR_OPT_IN_TOOL.get(toolId);
  const label = flag === undefined ? undefined : findFeatureFlag(flag)?.label;
  const enable = [
    label === undefined ? undefined : `turn on Settings → Features → ${label}`,
    "select the tool for the thread",
  ].filter((step) => step !== undefined);
  const recipe =
    tool.group === undefined
      ? ""
      : ` A recipe's own workflow can call it when the recipe declares tool group '${tool.group}'.`;
  return `It is off by default for a thread: ${enable.join(", or ")}.${recipe}`;
}
