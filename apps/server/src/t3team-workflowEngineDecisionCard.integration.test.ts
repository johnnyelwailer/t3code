// @effect-diagnostics nodeBuiltinImport:off - integration test reads workflow fixtures + temp dir.
/**
 * Real-path proof for the `askUser` decision cards (Epic 25 §askUser decision cards) on a real
 * orchestration V2 runtime (`t3team-workflowStubRuntime.ts`) with the production reactor:
 *
 *   1. launch → `askUser` suspends on `user.input`; the question is a run-less system message on
 *      the launch thread tagged `waiting-for-input`, and its decision card (the
 *      `workflow.decision` view with the affordance + correlationId, plus resource refs) is the
 *      message's `message-ext` artifact;
 *   2. the resolve route's value check (`rejectWorkflowResolveValue`, run against the same live
 *      registry state) rejects an invalid value or a stale correlationId and accepts a valid one;
 *   3. replies land as a person's messages: a stale structured reply and a widget action are
 *      ignored, and the reply pinned to the pending ask resolves it with its STRUCTURED value.
 */
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

import { assert, it } from "@effect/vitest";
import { afterAll } from "vite-plus/test";
import { readT3TeamMessageExtContext, type T3TeamMessageExt } from "@t3tools/contracts";
import { PROJECT_RECIPE_MESSAGE_VIEW_WORKFLOW_DECISION } from "@t3tools/project-recipes";
import type { AskAffordance } from "@t3team/sdk";
import * as Effect from "effect/Effect";

import { T3TeamThreadArtifactsStore } from "./t3team-v2/t3team-threadArtifactsStore.ts";
import {
  launchScenarioWorkflow,
  setUpLaunchThread,
  threadMessages,
  typeUserMessage,
  waitUntil,
} from "./t3team-workflowEngineScenario.fixtures.ts";
import { T3TeamWorkflowEngineRegistry } from "./t3team-workflowEngineRegistry.ts";
import { rejectWorkflowResolveValue } from "./t3team-workflowResolveInput.ts";
import { makeWorkflowStubRuntime } from "./t3team-workflowStubRuntime.ts";

const fixture = (name: string) =>
  NodeURL.fileURLToPath(new URL(`../__fixtures__/${name}`, import.meta.url));
const runsRoot = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3team-decision-"));
afterAll(() => NodeFS.rmSync(runsRoot, { recursive: true, force: true }));

// The only agent turns here are the ones a person's own reply starts on the launch thread.
const runtime = () =>
  makeWorkflowStubRuntime({ name: "t3team-workflow-decision", respond: () => "Noted." });

/** Launch a decision fixture to its askUser; return the pending ask and the card it posted. */
const launchToDecision = (key: string, workflow: string) =>
  Effect.gen(function* () {
    const registry = yield* T3TeamWorkflowEngineRegistry;
    const artifacts = yield* T3TeamThreadArtifactsStore;
    const { projectId, launchThreadId } = yield* setUpLaunchThread(`decision-${key}`);
    const question = `Decision for ${key}?`;
    const run = yield* launchScenarioWorkflow({
      runId: `${key}-run`,
      workflowPath: fixture(workflow),
      launchThreadId,
      projectId,
      runsRoot,
      args: { question },
    });
    assert.strictEqual(run.launched.status, "suspended");
    const pending = registry.peekPending(launchThreadId);
    assert.strictEqual(pending?.kind, "user.input");

    const message = (yield* threadMessages(launchThreadId)).find((m) => m.text === question);
    assert.strictEqual(message?.role, "system");
    assert.strictEqual(readT3TeamMessageExtContext(message?.context)?.status, "waiting-for-input");
    const card = yield* artifacts.get(`message-ext:${message?.id}`);
    assert.strictEqual(card?.kind, "message-ext");
    assert.strictEqual(card?.messageId, message?.id);
    const ext = card?.payload as T3TeamMessageExt | undefined;
    const view = ext?.attachments?.[0];
    if (view?.kind !== "view") throw new Error("expected a decision view attachment first");
    assert.strictEqual(view.miniappId, PROJECT_RECIPE_MESSAGE_VIEW_WORKFLOW_DECISION);
    assert.strictEqual(view.props["question"], question);
    assert.strictEqual(view.props["correlationId"], pending?.correlationId);
    const reject = (value: unknown, correlationId = pending?.correlationId) =>
      rejectWorkflowResolveValue({ pending, correlationId, hasValue: true, value });
    return { ...run, registry, launchThreadId, pending, ext, view, reject };
  });

it.live("choice card: ignores stale and widget replies, resolves with the structured value", () => {
  const stub = runtime();
  return Effect.gen(function* () {
    const run = yield* launchToDecision("choice", "t3team-decisionChoice.workflow.ts");
    const choice: AskAffordance = { kind: "choice", options: ["ship-now", "hold", "rollback"] };
    assert.deepStrictEqual(run.pending?.affordance, choice);
    assert.deepStrictEqual(run.view.props["affordance"], choice);
    const resource = run.ext?.attachments?.[1];
    if (resource?.kind !== "resource") throw new Error("expected a resource attachment second");
    const ref = "ref" in resource.resource ? resource.resource.ref : resource.resource;
    assert.strictEqual(ref.id, "BUG-7");

    assert.isNotNull(run.reject("merge-later"));
    assert.isNotNull(run.reject("hold", "choice-run:999"));
    assert.isNull(run.reject("hold"));

    // A reply authored for another ask, then a widget action: neither answers this ask.
    yield* typeUserMessage(run.launchThreadId, "ship-now", "stale", {
      workflowReply: { value: "ship-now", correlationId: "choice-run:999" },
    });
    yield* typeUserMessage(run.launchThreadId, "Widget action: Approve", "widget", {
      visibleToUser: false,
      widgetReply: { widgetId: "release-widget", widgetTitle: "release context" },
    });
    yield* waitUntil(() => stub.turns.length >= 2, "the two replies' own turns");
    assert.strictEqual(
      run.registry.peekPending(run.launchThreadId)?.correlationId,
      run.pending?.correlationId,
    );

    yield* typeUserMessage(run.launchThreadId, "hold", "reply", {
      workflowReply: { value: "hold", correlationId: run.pending?.correlationId ?? "" },
    });
    yield* waitUntil(() => run.completed.length > 0, "the run to complete after the decision");
    assert.deepStrictEqual(run.completed[0], { decision: "hold" });
    assert.isUndefined(run.registry.getRun("choice-run"));
  }).pipe(Effect.scoped, Effect.provide(stub.layer));
});

it.live("boolean card: labels ride the affordance, a structured true resumes the run", () => {
  const stub = runtime();
  return Effect.gen(function* () {
    const run = yield* launchToDecision("boolean", "t3team-decisionBoolean.workflow.ts");
    const affordance: AskAffordance = {
      kind: "boolean",
      labels: { true: "Ship it", false: "Hold" },
    };
    assert.deepStrictEqual(run.pending?.affordance, affordance);
    assert.deepStrictEqual(run.view.props["affordance"], affordance);
    assert.isNotNull(run.reject("yes"));
    assert.isNull(run.reject(true));

    yield* typeUserMessage(run.launchThreadId, "Ship it", "boolean", {
      workflowReply: { value: true, correlationId: run.pending?.correlationId ?? "" },
    });
    yield* waitUntil(() => run.completed.length > 0, "the boolean run to complete");
    assert.deepStrictEqual(run.completed[0], { approved: true });
  }).pipe(Effect.scoped, Effect.provide(stub.layer));
});

it.live("form card: the value check gates field types, a structured object resumes", () => {
  const stub = runtime();
  return Effect.gen(function* () {
    const run = yield* launchToDecision("form", "t3team-decisionForm.workflow.ts");
    const affordance: AskAffordance = {
      kind: "form",
      fields: [
        { name: "severity", type: "literals", options: ["low", "high"], optional: false },
        { name: "note", type: "string", optional: false },
        { name: "urgent", type: "boolean", optional: false },
      ],
    };
    assert.deepStrictEqual(run.pending?.affordance, affordance);
    assert.isNotNull(run.reject({ severity: "nope", note: "x", urgent: true }));
    assert.isNotNull(run.reject({ severity: "high", note: "x" }));
    assert.isNotNull(run.reject({ severity: "high", note: "x", urgent: "yes" }));
    const valid = { severity: "high", note: "rounding bug", urgent: true };
    assert.isNull(run.reject(valid));

    yield* typeUserMessage(run.launchThreadId, "severity: high", "form", {
      workflowReply: { value: valid, correlationId: run.pending?.correlationId ?? "" },
    });
    yield* waitUntil(() => run.completed.length > 0, "the form run to complete");
    assert.deepStrictEqual(run.completed[0], valid);
  }).pipe(Effect.scoped, Effect.provide(stub.layer));
});
