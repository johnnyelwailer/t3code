/**
 * Whether a work item key is inside the bound project, decided by the tracker and nowhere else:
 * the mirror keeps a row of an issue that was moved out until its pruning pass, so a mirror row
 * never vouches for membership. Shared by the read tools and the draft tool, so a key that one
 * answers "not in this project" the other refuses too.
 */
import { restrictJqlToProject, type JqlScopeResult } from "@t3tools/integrations-atlassian";
import * as Effect from "effect/Effect";

import { parseIssueKey } from "./t3team-workItemReadQuery.ts";
import type { WorkItemReadPort } from "./t3team-workItemReadService.ts";
import type { JiraMirrorBinding } from "./t3team-workflowSignalWorkItemProjectMirror.ts";

export const scoped = (result: JqlScopeResult) =>
  result.ok
    ? Effect.succeed(result.jql)
    : Effect.fail(
        `JQL refused (${result.reason}). Results are always limited to this project, so pass only the conditions you want to add.`,
      );

export const makeProjectScope = (port: Pick<WorkItemReadPort, "searchLive" | "mirrorGet">) => {
  /** The work item when `key` (already a parsed key) is in the project, else null. */
  const findInProject = Effect.fn("t3team.workItemScope.find")(function* (
    binding: JiraMirrorBinding,
    key: string,
  ) {
    const jql = yield* scoped(restrictJqlToProject(`key = "${key}"`, binding.externalProjectId));
    const live = (yield* port.searchLive(binding, jql, 1, undefined)).items[0] ?? null;
    if (live === null) return null;
    return (yield* port.mirrorGet(binding, key)) ?? live;
  });

  /** The keys that are not in the project; a key that is not a work item key counts as foreign. */
  const foreignKeys = Effect.fn("t3team.workItemScope.foreign")(function* (
    binding: JiraMirrorBinding,
    keys: ReadonlyArray<string>,
  ) {
    const foreign: string[] = [];
    for (const raw of new Set(keys)) {
      // Only a parsed key is ever interpolated into JQL; anything else is refused unqueried.
      const key = parseIssueKey(raw);
      if (key === null || (yield* findInProject(binding, key)) === null) foreign.push(raw);
    }
    return foreign;
  });

  return { findInProject, foreignKeys };
};
