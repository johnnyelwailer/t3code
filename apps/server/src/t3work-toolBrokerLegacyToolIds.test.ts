/**
 * The agent-orchestration rename kept `t3work.workflow.*` alive as deprecated
 * canonical aliases. Resolution happens BEFORE the availability gate, so a legacy
 * id dispatches even though only the current id is in the available set — that is
 * the property that keeps already-running agents working.
 */
import { assert, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { dispatchT3workToolCall } from "./t3work-toolBrokerBindingDispatch.ts";
import { buildBindingState } from "./t3work-toolBrokerBindingPermissions.ts";
import { T3WORK_WORKFLOW_RESUME_TOOL_ID } from "./t3work-toolBrokerBindingWorkflowResume.ts";
import { T3WORK_WORKFLOW_RUN_TOOL_ID } from "./t3work-toolBrokerBindingWorkflowRun.ts";
import { T3WORK_WORKFLOW_STATUS_TOOL_ID } from "./t3work-toolBrokerBindingWorkflowStatus.ts";
import {
  resolveT3workCanonicalToolId,
  T3WORK_LEGACY_CANONICAL_TOOL_IDS,
} from "./t3work-toolBrokerLegacyToolIds.ts";
import { T3WORK_MCP_SERVER_NAME } from "./t3work-toolBroker.ts";

describe("t3work legacy canonical tool ids", () => {
  it("maps every deprecated id onto the current canonical id", () => {
    expect(T3WORK_LEGACY_CANONICAL_TOOL_IDS).toEqual({
      "t3work.workflow.run": T3WORK_WORKFLOW_RUN_TOOL_ID,
      "t3work.workflow.status": T3WORK_WORKFLOW_STATUS_TOOL_ID,
      "t3work.workflow.resume": T3WORK_WORKFLOW_RESUME_TOOL_ID,
    });
    expect(resolveT3workCanonicalToolId("t3work.thread.rename")).toBe("t3work.thread.rename");
  });

  it.effect("dispatches the deprecated status id to the current handler", () =>
    Effect.gen(function* () {
      const seen: Array<string | undefined> = [];
      const state = buildBindingState({ availableToolIds: [T3WORK_WORKFLOW_STATUS_TOOL_ID] });
      const call = (tool: string) =>
        dispatchT3workToolCall({
          state,
          scopeLabel: "in this test",
          server: T3WORK_MCP_SERVER_NAME,
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

      const current = yield* call(T3WORK_WORKFLOW_STATUS_TOOL_ID);
      const legacy = yield* call("t3work.workflow.status");

      assert.isNotTrue(current.isError);
      assert.isNotTrue(legacy.isError);
      expect(seen).toEqual(["run-legacy", "run-legacy"]);
    }),
  );
});
