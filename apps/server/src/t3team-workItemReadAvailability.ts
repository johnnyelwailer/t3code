/**
 * Availability of the work-item read tools: they exist only while a usable Jira account is bound
 * to the calling thread's project in THIS environment. It is a question about the environment's
 * state, not about what kind of session this is, so a delegated cloud session (no Atlassian
 * account signed in) loses them without any cloud special case.
 *
 * Applied where both seams read from: `bindSession` drops the ids from the binding's available
 * tool ids, which removes them from `/mcp` `tools/list` (`t3team-mcpToolThreadList.ts` hides a tool
 * the caller's own binding does not hold) and from the workflow host-tool grant. A client holding
 * an older list gets {@link JIRA_NOT_CONNECTED_MESSAGE} instead of a "not enabled" riddle. Read
 * live on every bind, like the feature flags beside it, never cached.
 *
 * OFFERED BY ACCOUNT STATE, NOT BY TOOL CONTEXT. The reads are added to whatever the thread's synced
 * tool context lists, so a thread whose project has a usable Jira account gets them even when its
 * context does not name them. That is deliberate: `/mcp` threads (cloud, headless) carry no synced
 * web tool context at all, and the reads are read-only and project-scoped. Writes and drafts are
 * NOT affected: they still need the tool context (and, for a recipe, `allowedToolGroups`). A
 * recipe-launched binding that carries `allowedToolGroups` without `integration.read` does not get
 * them either. Behavior change to know: because the reads are added before the empty check, a bind
 * with an empty tool context returns a binding (holding just the two reads) while Jira is
 * connected, where it used to return no binding.
 */
import type { OrchestrationProjectShell, ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import { atlassianAuths } from "./t3team-atlassian-auth-state.ts";
import { findAuthForAccountId } from "./t3team-atlassian-auth-lookup.ts";
import { accountNeedsReconnect } from "./t3team-atlassian-auth-staleToken.ts";
import type { T3TeamToolBinding } from "./t3team-toolBroker.ts";
import { errorResult } from "./t3team-toolBrokerHelpers.ts";
import type { JiraMirrorBinding } from "./t3team-workflowSignalWorkItemProjectMirror.ts";

export const WORK_ITEM_READ_TOOL_IDS: ReadonlySet<string> = new Set([
  "t3team.work_item.search",
  "t3team.work_item.get",
]);

/**
 * The thread-bound draft tool (`t3_work_item_draft`). It is offered on the same account state as the
 * reads and additionally only while `WORKITEM_DETAIL_DRAFTS` is on; see `withWorkItemDraftTool`.
 */
export const WORK_ITEM_DRAFT_TOOL_ID = "t3team.work_item.draft";

/** Every tool that exists only while a usable Jira account is bound to the thread's project. */
export const JIRA_BOUND_TOOL_IDS: ReadonlySet<string> = new Set([
  ...WORK_ITEM_READ_TOOL_IDS,
  WORK_ITEM_DRAFT_TOOL_ID,
]);

export const JIRA_NOT_CONNECTED_MESSAGE =
  "Jira is not connected in this environment. Continue without it.";

/** The project's Jira binding as the shell carries it (same data as `t3team_project_source_bindings`). */
function jiraBindingOfProject(
  project: Pick<OrchestrationProjectShell, "source">,
): JiraMirrorBinding | null {
  const source = project.source;
  if (source === undefined || source.provider !== "atlassian" || !("accountId" in source)) {
    return null;
  }
  return {
    provider: source.provider,
    accountId: source.accountId,
    externalProjectId: source.externalProjectId,
  };
}

/** A signed-in account on this host whose session still works. */
const isAtlassianAccountUsable = (accountId: string): boolean =>
  findAuthForAccountId(atlassianAuths, accountId) !== undefined &&
  !accountNeedsReconnect(accountId);

/**
 * The thread's project Jira binding when its account is usable here, else null. The one question
 * behind both the tool list and the call, so they cannot disagree.
 */
export const makeUsableJiraBindingForThread =
  (input: {
    readonly loadThreadProject: (
      threadId: ThreadId,
    ) => Effect.Effect<{ readonly project: Pick<OrchestrationProjectShell, "source"> }, string>;
    readonly accountUsable?: (accountId: string) => boolean;
  }) =>
  (threadId: ThreadId): Effect.Effect<JiraMirrorBinding | null> =>
    input.loadThreadProject(threadId).pipe(
      Effect.map(({ project }) => {
        const binding = jiraBindingOfProject(project);
        const usable = input.accountUsable ?? isAtlassianAccountUsable;
        return binding !== null && usable(binding.accountId) ? binding : null;
      }),
      Effect.catch(() => Effect.succeed(null)),
    );

/** `toolIds` with the work-item read tools present exactly while Jira is connected. */
export function withWorkItemReadTools(
  toolIds: ReadonlyArray<string>,
  connected: boolean,
): ReadonlyArray<string> {
  const rest = toolIds.filter((id) => !WORK_ITEM_READ_TOOL_IDS.has(id));
  return connected ? [...rest, ...WORK_ITEM_READ_TOOL_IDS] : rest;
}

/**
 * `toolIds` with the draft tool present exactly while Jira is connected AND the drafts flag is on.
 * `draftsEnabled` is the live flag read of the caller, never a cached value.
 */
export function withWorkItemDraftTool(
  toolIds: ReadonlyArray<string>,
  connected: boolean,
  draftsEnabled: boolean,
): ReadonlyArray<string> {
  const rest = toolIds.filter((id) => id !== WORK_ITEM_DRAFT_TOOL_ID);
  return connected && draftsEnabled ? [...rest, WORK_ITEM_DRAFT_TOOL_ID] : rest;
}

/** The binding, answering a Jira-bound tool (reads, drafts) with the not-connected text while it is not. */
export function refuseWorkItemReadUnlessConnected<B extends T3TeamToolBinding | undefined>(
  binding: B,
  connected: boolean,
): B {
  if (binding === undefined || connected) return binding;
  const callTool: T3TeamToolBinding["callTool"] = (input) =>
    JIRA_BOUND_TOOL_IDS.has(input.tool)
      ? Effect.succeed(errorResult(JIRA_NOT_CONNECTED_MESSAGE))
      : binding.callTool(input);
  return { ...binding, callTool };
}
