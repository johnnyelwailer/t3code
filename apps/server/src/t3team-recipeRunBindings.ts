/**
 * What a recipe's own declaration grants one run of it: its private scripts, the host-tool bridge
 * bound to the launch thread within the recipe's declared tool groups, and the scripts' host
 * members (`ctx.store`, `ctx.changeRequests`). Shared by every recipe launch — the launch route
 * and the agent's run-by-id — so a recipe runs with the same powers however it is started.
 * Scope always comes from the recipe module, never from a caller.
 */
import type { ProjectId, ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import { resolveRecipeHostToolScope } from "./t3team-recipeWorkflowToolScope.ts";
import { resolveRecipeWorkflowScripts } from "./t3team-recipeWorkflowScripts.ts";
import type { T3TeamScriptHost } from "./t3team-scriptHostContext.ts";
import type { T3TeamToolBrokerShape } from "./t3team-toolBroker.ts";
import { makeT3TeamWorkflowHostToolClient } from "./t3team-workflowHostTools.ts";

export const resolveRecipeRunBindings = Effect.fn("resolveRecipeRunBindings")(function* (input: {
  readonly runId: string;
  readonly threadId: ThreadId;
  readonly projectId: ProjectId;
  readonly recipePath: string | undefined;
  readonly workflowPath: string;
  readonly toolBroker: Pick<T3TeamToolBrokerShape, "bindSession">;
  readonly scriptHosts: T3TeamScriptHost["Service"];
}) {
  const { recipePath, workflowPath } = input;
  // `recipe.ts` scripts become the body's `scripts.*`; recipe.json recipes resolve to none.
  const scripts = yield* resolveRecipeWorkflowScripts({ recipePath, workflowPath });
  // Unresolvable scope ⇒ no bridge at all; the resolved scope is persisted as the grant, so a
  // restart restores exactly this.
  const hostToolScope = yield* resolveRecipeHostToolScope({ recipePath, workflowPath });
  if (hostToolScope.kind === "denied") {
    yield* Effect.logDebug("workflow launch runs without host tools", {
      runId: input.runId,
      reason: hostToolScope.reason,
    });
  }
  const hostToolGrant =
    hostToolScope.kind === "granted" ? { toolGroups: hostToolScope.toolGroups } : undefined;
  const hostToolClient =
    hostToolScope.kind === "granted"
      ? makeT3TeamWorkflowHostToolClient({
          broker: input.toolBroker,
          launchThreadId: input.threadId,
          allowedToolGroups: hostToolScope.toolGroups,
        })
      : undefined;
  const scriptHost = input.scriptHosts.forRun({
    projectId: input.projectId,
    recipePath,
    toolGroups: hostToolGrant?.toolGroups,
  });
  return {
    // The recipe dir is persisted for every recipe run (it also scopes `launchThread` keys);
    // scripts and their host only when there are scripts to re-resolve after a restart.
    ...(recipePath === undefined ? {} : { recipePath }),
    ...(Object.keys(scripts).length === 0 || recipePath === undefined
      ? {}
      : { scripts, scriptHost }),
    ...(hostToolClient === undefined || hostToolGrant === undefined
      ? {}
      : { hostToolClient, hostToolGrant }),
  };
});
