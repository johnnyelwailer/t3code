// @effect-diagnostics nodeBuiltinImport:off - integration test reads a workflow fixture + temp dir.
/**
 * The resolve route's reply path on a real orchestration V2 runtime with the production workflow
 * reactor: a decision-card answer recorded as the person's run-less message resumes the parked
 * `askUser` with its structured value, and no agent turn is started for it.
 */
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

import { assert, it } from "@effect/vitest";
import { MessageId, ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import { afterAll } from "vite-plus/test";

import { recordWorkflowReply } from "./t3team-thread-recipe-workflow-reply.ts";
import {
  launchScenarioWorkflow,
  setUpLaunchThread,
  waitUntil,
} from "./t3team-workflowEngineScenario.fixtures.ts";
import { T3TeamWorkflowEngineRegistry } from "./t3team-workflowEngineRegistry.ts";
import { makeWorkflowStubRuntime } from "./t3team-workflowStubRuntime.ts";

const fixture = (name: string) =>
  NodeURL.fileURLToPath(new URL(`../__fixtures__/${name}`, import.meta.url));
const runsRoot = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3team-reply-"));
afterAll(() => NodeFS.rmSync(runsRoot, { recursive: true, force: true }));

it.live("a recorded card reply resumes the parked ask without starting an agent turn", () => {
  const stub = makeWorkflowStubRuntime({ name: "t3team-workflow-reply", respond: () => "Noted." });
  return Effect.gen(function* () {
    const registry = yield* T3TeamWorkflowEngineRegistry;
    const { projectId, launchThreadId } = yield* setUpLaunchThread("workflow-reply");
    const run = yield* launchScenarioWorkflow({
      runId: "reply-run",
      workflowPath: fixture("t3team-decisionBoolean.workflow.ts"),
      launchThreadId,
      projectId,
      runsRoot,
      args: { question: "Ship it?" },
    });
    const pending = registry.peekPending(launchThreadId);
    assert.strictEqual(pending?.kind, "user.input");

    yield* recordWorkflowReply({
      threadId: ThreadId.make(launchThreadId),
      messageId: MessageId.make("reply-msg"),
      text: "Ship it",
      workflowReply: { value: true, correlationId: pending?.correlationId ?? "" },
    });

    yield* waitUntil(() => run.completed.length > 0, "the run to resume from the recorded reply");
    assert.deepStrictEqual(run.completed[0], { approved: true });
    assert.strictEqual(stub.turns.length, 0);
  }).pipe(Effect.scoped, Effect.provide(stub.layer));
});
