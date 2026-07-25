/**
 * The agent-orchestration rename kept `t3team.workflow.*` alive as deprecated
 * canonical aliases. Resolution happens BEFORE the availability gate, so a legacy
 * id dispatches even though only the current id is in the available set — that is
 * the property that keeps already-running agents working.
 */
import { assert, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { dispatchT3TeamToolCall } from "./t3team-toolBrokerBindingDispatch.ts";
import { buildBindingState } from "./t3team-toolBrokerBindingPermissions.ts";
import { T3TEAM_WORKFLOW_RESUME_TOOL_ID } from "./t3team-toolBrokerBindingWorkflowResume.ts";
import { T3TEAM_WORKFLOW_RUN_TOOL_ID } from "./t3team-toolBrokerBindingWorkflowRun.ts";
import { T3TEAM_WORKFLOW_STATUS_TOOL_ID } from "./t3team-toolBrokerBindingWorkflowStatus.ts";
import {
  resolveT3TeamCanonicalToolId,
  T3TEAM_LEGACY_CANONICAL_TOOL_IDS,
} from "./t3team-toolBrokerLegacyToolIds.ts";
import { T3TEAM_MCP_SERVER_NAME } from "./t3team-toolBroker.ts";

describe("t3team legacy canonical tool ids", () => {
  it("maps every deprecated id onto the current canonical id", () => {
    expect(T3TEAM_LEGACY_CANONICAL_TOOL_IDS).toEqual({
      "t3team.workflow.run": T3TEAM_WORKFLOW_RUN_TOOL_ID,
      "t3team.workflow.status": T3TEAM_WORKFLOW_STATUS_TOOL_ID,
      "t3team.workflow.resume": T3TEAM_WORKFLOW_RESUME_TOOL_ID,
    });
    expect(resolveT3TeamCanonicalToolId("t3team.thread.rename")).toBe("t3team.thread.rename");
  });

  it.effect("dispatches the deprecated status id to the current handler", () =>
    Effect.gen(function* () {
      const seen: Array<string | undefined> = [];
      const state = buildBindingState({ availableToolIds: [T3TEAM_WORKFLOW_STATUS_TOOL_ID] });
      const call = (tool: string) =>
        dispatchT3TeamToolCall({
          state,
          scopeLabel: "in this test",
          server: T3TEAM_MCP_SERVER_NAME,
          tool,
          toolArgs: { runId: "run-legacy" },
          readView: () => Effect.succeed({}),
          workflowStatusTools: {
            getStatus: ({ runId }) => {
              seen.push(runId);
              return Effect.succeed({ runs: [] });
            },
          },
        });

      const current = yield* call(T3TEAM_WORKFLOW_STATUS_TOOL_ID);
      const legacy = yield* call("t3team.workflow.status");

      assert.isNotTrue(current.isError);
      assert.isNotTrue(legacy.isError);
      expect(seen).toEqual(["run-legacy", "run-legacy"]);
    }),
  );
});
