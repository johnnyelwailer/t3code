/**
 * Shared test fixtures for the durable-execution engine test suite. Keeps the per-test
 * counters and the SDK tool/script/workflow definitions in one file so the test files
 * (split across several `t3work-sdk.engine.*.test.ts` modules for additive-guard LOC
 * compliance) all import the same setup.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import * as Schema from "effect/Schema";

import type * as AgentPrimitiveWorkflow from "./__fixtures__/t3work-sdk.agentPrimitive.workflow.ts";
import type * as AgentTaskWorkflow from "./__fixtures__/t3work-sdk.agentTask.workflow.ts";
import type * as AskResponseWorkflow from "./__fixtures__/t3work-sdk.askResponse.workflow.ts";
import type * as BudgetWorkflow from "./__fixtures__/t3work-sdk.budgetPrimitive.workflow.ts";
import type * as ChildSpawnWorkflow from "./__fixtures__/t3work-sdk.childSpawn.workflow.ts";
import type * as HandleDismissWorkflow from "./__fixtures__/t3work-sdk.handleDismiss.workflow.ts";
import type * as FireForgetWorkflow from "./__fixtures__/t3work-sdk.handleFireForget.workflow.ts";
import type * as ThreadSendDeniedWorkflow from "./__fixtures__/t3work-sdk.threadSendDenied.workflow.ts";
import type * as ParallelWorkflow from "./__fixtures__/t3work-sdk.parallelPrimitive.workflow.ts";
import type * as PipelineWorkflow from "./__fixtures__/t3work-sdk.pipelinePrimitive.workflow.ts";
import type * as SubParentWorkflow from "./__fixtures__/t3work-sdk.subParent.workflow.ts";
import type * as WaitWorkflow from "./__fixtures__/t3work-sdk.waitPrimitive.workflow.ts";
import type * as InsertedWorkflow from "./__fixtures__/t3work-sdk.journalInserted.workflow.ts";
import type * as BigintResultWorkflow from "./__fixtures__/t3work-sdk.bigintResult.workflow.ts";
import type * as ErrorGlobalsWorkflow from "./__fixtures__/t3work-sdk.errorGlobals.workflow.ts";
import type * as NeverBaseWorkflow from "./__fixtures__/t3work-sdk.neverMarkerBase.workflow.ts";
import type * as NeverRemovedWorkflow from "./__fixtures__/t3work-sdk.neverMarkerRemoved.workflow.ts";
import type * as NowWorkflow from "./__fixtures__/t3work-sdk.journalNow.workflow.ts";
import type * as RandomWorkflow from "./__fixtures__/t3work-sdk.journalRandom.workflow.ts";
import type * as ScriptWorkflow from "./__fixtures__/t3work-sdk.journalScript.workflow.ts";
import type * as TwoToolsWorkflow from "./__fixtures__/t3work-sdk.journalTwoTools.workflow.ts";
import type * as UuidWorkflow from "./__fixtures__/t3work-sdk.journalUuid.workflow.ts";
import type * as VoidResultWorkflow from "./__fixtures__/t3work-sdk.voidResult.workflow.ts";
import { defineScript, defineTool, defineToolGroup, defineWorkflow } from "./t3work-sdk.index.ts";
import type { LlmDispatcher } from "./t3work-sdk.primitiveTypes.ts";

// ── Test-controlled tool behavior ──────────────────────────────────────────
// Counters live on a single mutable holder so tests across multiple files can read AND
// write them (ESM `export let` is read-only from the importer's perspective).
export const counters = {
  approveCalls: 0,
  mergeCalls: 0,
  mergeShouldFail: false,
  noopCalls: 0,
  greetCalls: 0,
  ticketCounter: 0,
  llmCalls: 0,
};
export function resetCounters(): void {
  counters.approveCalls = 0;
  counters.mergeCalls = 0;
  counters.mergeShouldFail = false;
  counters.noopCalls = 0;
  counters.greetCalls = 0;
  counters.ticketCounter = 0;
  counters.llmCalls = 0;
}

/** A canned LLM response keyed by prompt; `text` backs a bare `agent`, `structured` backs a
 * schema/`agent.task` call. */
export interface MockLlmResponse {
  readonly text?: string;
  readonly structured?: unknown;
  readonly tokens: number;
}

/** Deterministic {@link LlmDispatcher} for tests: looks responses up by prompt and bumps
 * `counters.llmCalls` so a test can assert the dispatcher does NOT re-fire on replay. */
export function createMockLlmDispatcher(responses: Map<string, MockLlmResponse>): LlmDispatcher {
  return async (req) => {
    const canned = responses.get(req.prompt);
    if (canned === undefined) {
      throw new Error(`mock LLM dispatcher: no canned response for prompt '${req.prompt}'`);
    }
    counters.llmCalls += 1;
    return { text: canned.text ?? "", tokens: canned.tokens, structured: canned.structured };
  };
}

const demoGroup = defineToolGroup({
  id: "demo.read",
  label: "Demo tools",
  description: "Tools used by the durable-engine test suite.",
});

export const approveTool = defineTool({
  id: "demo.approve",
  group: demoGroup,
  args: Schema.Struct({ prId: Schema.String }),
  result: Schema.Struct({ approved: Schema.Boolean, approvalId: Schema.String }),
  handler: async (input) => {
    counters.approveCalls += 1;
    return { approved: true, approvalId: `approval-${input.prId}` };
  },
});

export const mergeTool = defineTool({
  id: "demo.merge",
  group: demoGroup,
  args: Schema.Struct({ prId: Schema.String, approvalId: Schema.String }),
  result: Schema.Struct({ sha: Schema.String }),
  handler: async (input) => {
    counters.mergeCalls += 1;
    if (counters.mergeShouldFail)
      throw new Error("simulated merge failure (kills the run after seq 1)");
    return { sha: `sha-${input.prId}` };
  },
});

export const lintTool = defineTool({
  id: "demo.lint",
  group: demoGroup,
  args: Schema.Struct({ prId: Schema.String }),
  result: Schema.Struct({ score: Schema.Number }),
  handler: async () => ({ score: 100 }),
});

export const noopTool = defineTool({
  id: "demo.noop",
  group: demoGroup,
  args: Schema.Struct({ note: Schema.String }),
  result: Schema.Void,
  handler: async () => {
    counters.noopCalls += 1;
  },
});

export const bigintTool = defineTool({
  id: "demo.bigintResult",
  group: demoGroup,
  args: Schema.Struct({}),
  result: Schema.Any,
  handler: async () => 10n as unknown,
});

export const demoTools = [approveTool, mergeTool, lintTool, noopTool, bigintTool] as const;

export const greetScript = defineScript({
  inputs: Schema.Struct({ name: Schema.String }),
  outputs: Schema.Struct({ text: Schema.String }),
  handler: async (input) => {
    counters.greetCalls += 1;
    return { text: `hi ${input.name}` };
  },
});

export const freshTicketScript = defineScript({
  replay: "never",
  inputs: Schema.Struct({}),
  outputs: Schema.Struct({ id: Schema.String }),
  handler: async () => {
    counters.ticketCounter += 1;
    return { id: `ticket-${counters.ticketCounter}` };
  },
});

export const farewellScript = defineScript({
  inputs: Schema.Struct({ name: Schema.String }),
  outputs: Schema.Struct({ text: Schema.String }),
  handler: async (input) => ({ text: `bye ${input.name}` }),
});

export const demoScripts = {
  greet: greetScript,
  freshTicket: freshTicketScript,
  farewell: farewellScript,
};

export const twoTools = defineWorkflow<typeof TwoToolsWorkflow>(
  "./__fixtures__/t3work-sdk.journalTwoTools.workflow.ts",
);
export const insertedWorkflow = defineWorkflow<typeof InsertedWorkflow>(
  "./__fixtures__/t3work-sdk.journalInserted.workflow.ts",
);
export const scriptWorkflow = defineWorkflow<typeof ScriptWorkflow>(
  "./__fixtures__/t3work-sdk.journalScript.workflow.ts",
);
export const voidResultWorkflow = defineWorkflow<typeof VoidResultWorkflow>(
  "./__fixtures__/t3work-sdk.voidResult.workflow.ts",
);
export const bigintResultWorkflow = defineWorkflow<typeof BigintResultWorkflow>(
  "./__fixtures__/t3work-sdk.bigintResult.workflow.ts",
);
export const errorGlobalsWorkflow = defineWorkflow<typeof ErrorGlobalsWorkflow>(
  "./__fixtures__/t3work-sdk.errorGlobals.workflow.ts",
);
export const neverMarkerBaseWorkflow = defineWorkflow<typeof NeverBaseWorkflow>(
  "./__fixtures__/t3work-sdk.neverMarkerBase.workflow.ts",
);
export const neverMarkerRemovedWorkflow = defineWorkflow<typeof NeverRemovedWorkflow>(
  "./__fixtures__/t3work-sdk.neverMarkerRemoved.workflow.ts",
);
export const nowWorkflow = defineWorkflow<typeof NowWorkflow>(
  "./__fixtures__/t3work-sdk.journalNow.workflow.ts",
);
export const randomWorkflow = defineWorkflow<typeof RandomWorkflow>(
  "./__fixtures__/t3work-sdk.journalRandom.workflow.ts",
);
export const uuidWorkflow = defineWorkflow<typeof UuidWorkflow>(
  "./__fixtures__/t3work-sdk.journalUuid.workflow.ts",
);
export const agentPrimitiveWorkflow = defineWorkflow<typeof AgentPrimitiveWorkflow>(
  "./__fixtures__/t3work-sdk.agentPrimitive.workflow.ts",
);
export const agentTaskWorkflow = defineWorkflow<typeof AgentTaskWorkflow>(
  "./__fixtures__/t3work-sdk.agentTask.workflow.ts",
);
export const budgetWorkflow = defineWorkflow<typeof BudgetWorkflow>(
  "./__fixtures__/t3work-sdk.budgetPrimitive.workflow.ts",
);
export const parallelWorkflow = defineWorkflow<typeof ParallelWorkflow>(
  "./__fixtures__/t3work-sdk.parallelPrimitive.workflow.ts",
);
export const pipelineWorkflow = defineWorkflow<typeof PipelineWorkflow>(
  "./__fixtures__/t3work-sdk.pipelinePrimitive.workflow.ts",
);
export const subParentWorkflow = defineWorkflow<typeof SubParentWorkflow>(
  "./__fixtures__/t3work-sdk.subParent.workflow.ts",
);
export const waitWorkflow = defineWorkflow<typeof WaitWorkflow>(
  "./__fixtures__/t3work-sdk.waitPrimitive.workflow.ts",
);
export const askResponseWorkflow = defineWorkflow<typeof AskResponseWorkflow>(
  "./__fixtures__/t3work-sdk.askResponse.workflow.ts",
);
export const handleDismissWorkflow = defineWorkflow<typeof HandleDismissWorkflow>(
  "./__fixtures__/t3work-sdk.handleDismiss.workflow.ts",
);
export const fireForgetWorkflow = defineWorkflow<typeof FireForgetWorkflow>(
  "./__fixtures__/t3work-sdk.handleFireForget.workflow.ts",
);
export const threadSendDeniedWorkflow = defineWorkflow<typeof ThreadSendDeniedWorkflow>(
  "./__fixtures__/t3work-sdk.threadSendDenied.workflow.ts",
);
export const childSpawnWorkflow = defineWorkflow<typeof ChildSpawnWorkflow>(
  "./__fixtures__/t3work-sdk.childSpawn.workflow.ts",
);

export const runsRoot = mkdtempSync(join(tmpdir(), "t3work-engine-"));
export function cleanupRunsRoot(): void {
  rmSync(runsRoot, { recursive: true, force: true });
}
