// @effect-diagnostics nodeBuiltinImport:off - reads workflow fixtures from a temp runs root.
/**
 * A workflow body reaches `t3team.work_item.search` through `getTools()` under the same gates as
 * the draft tools: the body must declare `integration.read`, the recipe's `allowedToolGroups` must
 * allow it, and the broker binding must hold it (`t3team-workItemReadAvailability.test.ts` proves
 * that binding drops it without a Jira account, including when the run grants it for the call).
 */
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

import { afterAll, describe, expect, it } from "vite-plus/test";
import { ProjectId, ProviderInstanceId } from "@t3tools/contracts";
import { createModelSelection } from "@t3tools/shared/model";
import * as Effect from "effect/Effect";

import type { T3TeamToolBrokerShape } from "./t3team-toolBroker.ts";
import { threadId } from "./t3team-toolBrokerTestUtils.ts";
import { launchWorkflowRecipe } from "./t3team-workflowEngineLaunch.ts";
import { makeWorkflowEngineRegistry } from "./t3team-workflowEngineRegistry.ts";
import { makeFakeWorkflowHost } from "./t3team-workflowHostFake.fixtures.ts";
import { makeT3TeamWorkflowHostToolClient } from "./t3team-workflowHostTools.ts";

const fixturePath = (name: string): string =>
  NodeURL.fileURLToPath(new URL(`../__fixtures__/${name}`, import.meta.url));
const runsRoot = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3team-host-read-"));
afterAll(() => NodeFS.rmSync(runsRoot, { recursive: true, force: true }));

const answer = { ok: true, source: "mirror", items: [] };

function makeStubBroker() {
  const calls: Array<{ readonly tool: string; readonly args: unknown }> = [];
  const grants: Array<ReadonlyArray<string> | undefined> = [];
  const broker: T3TeamToolBrokerShape = {
    bindSession: (input) =>
      Effect.sync(() => {
        grants.push(input.grantedToolIds);
        return {
          threadId: input.threadId,
          listServers: () => [],
          readResource: ({ uri }) => Effect.succeed({ contents: [{ uri, text: "" }] }),
          callTool: ({ tool, arguments: toolArgs }) =>
            Effect.sync(() => {
              calls.push({ tool, args: toolArgs });
              return { content: [], structuredContent: answer };
            }),
        };
      }),
    bindReadOnly: () => Effect.succeed(undefined),
  };
  return { broker, calls, grants };
}

async function launch(input: {
  readonly runId: string;
  readonly workflow: string;
  readonly allowedToolGroups?: ReadonlyArray<string>;
}) {
  const { broker, calls, grants } = makeStubBroker();
  const hostToolClient = makeT3TeamWorkflowHostToolClient({
    broker,
    launchThreadId: threadId,
    ...(input.allowedToolGroups === undefined
      ? {}
      : { allowedToolGroups: input.allowedToolGroups }),
  });
  const completed: unknown[] = [];
  const errors: unknown[] = [];
  let seq = 0;
  const result = await launchWorkflowRecipe({
    runId: input.runId,
    workflowPath: fixturePath(input.workflow),
    args: { status: "Open" },
    runsRoot,
    launchThreadId: threadId,
    projectId: ProjectId.make("project-1"),
    modelSelection: createModelSelection(ProviderInstanceId.make("inst-1"), "model-x"),
    runtimeMode: "full-access",
    interactionMode: "default",
    registry: makeWorkflowEngineRegistry(),
    host: makeFakeWorkflowHost().host,
    newId: () => `${input.runId}-id-${(seq += 1)}`,
    nowIso: () => "2026-07-27T00:00:00.000Z",
    ...(hostToolClient === undefined ? {} : { hostToolClient }),
    onComplete: async (output) => {
      completed.push(output);
    },
    onError: async (error) => {
      errors.push(error);
    },
  });
  return { result, completed, errors, calls, grants };
}

describe("workflow host read tools", () => {
  it("a body declaring 'integration.read' searches through the broker, granted for that call", async () => {
    const { result, completed, calls, grants } = await launch({
      runId: "read-declared",
      workflow: "t3team-hostWorkItemRead.workflow.ts",
      allowedToolGroups: ["integration.read"],
    });
    expect(result.status).toBe("completed");
    expect(completed[0]).toEqual({ found: answer });
    expect(calls).toEqual([
      { tool: "t3team.work_item.search", args: { status: ["Open"], limit: 5 } },
    ]);
    expect(grants).toEqual([["t3team.work_item.search"]]);
  });

  it("refuses a body that does not declare the group, before the broker is reached", async () => {
    const { result, errors, calls } = await launch({
      runId: "read-undeclared",
      workflow: "t3team-hostWorkItemReadUndeclared.workflow.ts",
    });
    expect(result.status).toBe("failed");
    expect(String(errors[0])).toContain("PermissionDeniedError");
    expect(String(errors[0])).toContain("integration.read");
    expect(calls).toEqual([]);
  });
});
