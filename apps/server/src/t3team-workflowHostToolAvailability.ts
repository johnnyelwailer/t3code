/**
 * What a recipe workflow launch's host-tool bridge actually IS, once TWO independent gates are
 * both applied:
 *
 *   1. `hostToolScope` (`t3team-recipeWorkflowToolScope.ts`) — what the RECIPE declared it may
 *      reach. Fail-closed, unchanged by this module: that resolver never sees a project at all.
 *   2. `resolveT3TeamWorkflowHostDraftToolAvailability` below — what the PROJECT actually
 *      provides. A recipe declaring `mutation.draft` in a project with no connected work-source
 *      integration (no Jira/Atlassian, Linear, or GitHub-managed project) would otherwise be
 *      handed tools that cannot possibly succeed — the declared scope was never intersected with
 *      what the project has.
 *
 * NARROWS ONLY: gate 2 can turn an otherwise-granted bridge unavailable, never the reverse.
 *
 * `resolveT3TeamWorkflowHostToolBinding` folds both gates AND their launch-time log line into one
 * call, so the launch route (`t3team-thread-recipe-workflow-routes.ts`) is a plain destructure —
 * never silence, per the SDK capability vocabulary's warning against a confusing "tool not
 * enabled" failure surfacing turns later with no clue why.
 *
 * @module t3team-workflowHostToolAvailability
 */
import type { ProjectSourceBinding } from "@t3tools/contracts";
import {
  getT3TeamToolDefinition,
  requiresWorkSourceT3TeamTool,
} from "@t3tools/project-context/t3teamToolCatalog";
import * as Effect from "effect/Effect";

import type { T3TeamToolHandlerClient } from "@t3team/sdk";

import type { T3TeamWorkflowHostToolScope } from "./t3team-recipeWorkflowToolScope.ts";
import type { T3TeamToolBrokerShape } from "./t3team-toolBroker.ts";
import {
  makeT3TeamWorkflowHostDraftToolClient,
  T3TEAM_WORKFLOW_HOST_DRAFT_TOOL_IDS,
} from "./t3team-workflowHostDraftTools.ts";

/**
 * True today because every id in `T3TEAM_WORKFLOW_HOST_DRAFT_TOOL_IDS` carries a work-source-only
 * catalog surface (`work-item`/`my-work` — see `requiresWorkSourceT3TeamTool`,
 * packages/project-context/src/t3teamToolCatalogCore.ts). Computed from the catalog rather than
 * hardcoded so drift is caught here instead of silently reopening the gate below. `.some`, not
 * `.every`: if a future id is added to that list which does NOT need a work source, the gate must
 * stay ACTIVE for the ones that still do — the safe failure direction is over-denying, never
 * under-denying. (Per-tool granularity would remove even that over-denial, but the bridge is
 * bound as one unit today.)
 */
const DRAFT_TOOLS_REQUIRE_WORK_SOURCE_INTEGRATION = T3TEAM_WORKFLOW_HOST_DRAFT_TOOL_IDS.some((id) =>
  requiresWorkSourceT3TeamTool(getT3TeamToolDefinition(id)),
);

export type T3TeamWorkflowHostDraftToolAvailability =
  | { readonly kind: "available" }
  | { readonly kind: "unavailable"; readonly reason: string };

/** What the PROJECT actually provides, independent of what the recipe declared it may reach. */
export function resolveT3TeamWorkflowHostDraftToolAvailability(
  projectSource: ProjectSourceBinding | undefined,
): T3TeamWorkflowHostDraftToolAvailability {
  if (!DRAFT_TOOLS_REQUIRE_WORK_SOURCE_INTEGRATION) return { kind: "available" };
  if (projectSource !== undefined && projectSource.provider !== "local") {
    return { kind: "available" };
  }
  return {
    kind: "unavailable",
    reason:
      "the project has no connected work-source integration (Jira/Atlassian, Linear, a GitHub-managed project, ...), so the work-item draft tools this run declared cannot be bound",
  };
}

/**
 * A client whose every call refuses immediately with a specific, honest `reason` instead of
 * reaching the broker. The run DOES have a launch thread here (unlike a headless run), so the
 * generic "needs a thread-bound host runtime" message (`t3team-workflowHostDraftTools.ts`) would
 * be misleading — the thread IS bound, the PROJECT just has nothing behind these tools. The
 * broker is never called, so nothing is bound-and-failing against a project with no integration.
 */
export function makeT3TeamWorkflowHostDraftToolUnavailableClient(
  reason: string,
): T3TeamToolHandlerClient {
  return {
    renameThread: async () => {
      throw new Error("t3team.thread.rename is not reachable through workflow host tools.");
    },
    callHostTool: async ({ tool }) => {
      throw new Error(`Tool '${tool}' is not available for this launch: ${reason}`);
    },
  };
}

/** The launch route's single entry point: resolve the bridge, log why it is narrowed or absent,
 * and hand back exactly what `launchPreparedWorkflow` needs. */
export const resolveT3TeamWorkflowHostToolBinding = Effect.fn(
  "resolveT3TeamWorkflowHostToolBinding",
)(function* (input: {
  readonly runId: string;
  readonly hostToolScope: T3TeamWorkflowHostToolScope;
  readonly projectSource: ProjectSourceBinding | undefined;
  readonly broker: T3TeamToolBrokerShape;
  readonly launchThreadId: string;
}) {
  if (input.hostToolScope.kind === "denied") {
    yield* Effect.logDebug("workflow launch runs without host tools", {
      runId: input.runId,
      reason: input.hostToolScope.reason,
    });
    return { hostToolGrant: undefined, hostToolClient: undefined } as const;
  }

  const availability = resolveT3TeamWorkflowHostDraftToolAvailability(input.projectSource);
  if (availability.kind === "unavailable") {
    // Visible at the default log level on purpose — unlike the `denied` case above (a
    // recipe-authoring choice), this is a live launch whose author declared tools the project
    // cannot serve.
    yield* Effect.logWarning(
      "workflow launch narrows its declared host tools to what the project actually provides",
      { runId: input.runId, reason: availability.reason },
    );
    return {
      hostToolGrant: undefined,
      hostToolClient: makeT3TeamWorkflowHostDraftToolUnavailableClient(availability.reason),
    } as const;
  }

  return {
    hostToolGrant: { toolGroups: input.hostToolScope.toolGroups },
    hostToolClient: makeT3TeamWorkflowHostDraftToolClient({
      broker: input.broker,
      launchThreadId: input.launchThreadId,
      allowedToolGroups: input.hostToolScope.toolGroups,
    }),
  } as const;
});
