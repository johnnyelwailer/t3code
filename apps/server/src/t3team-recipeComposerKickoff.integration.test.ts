// @effect-diagnostics nodeBuiltinImport:off - integration test launches a workflow fixture in a temp workspace.
/**
 * A recipe attached in the chat composer, on a real V2 runtime: the person's text is recorded as
 * their run-less message carrying `recipeKickoff`, the launch replies once the run is admitted,
 * and the run then parks on its own ask without that message answering it.
 */
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import { readT3TeamMessageExtContext, ThreadId } from "@t3tools/contracts";
import { createModelSelection } from "@t3tools/shared/model";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { afterAll } from "vite-plus/test";

import { ServerConfig } from "./config.ts";
import {
  composerKickoffArgs,
  recordComposerKickoffMessage,
} from "./t3team-recipeComposerKickoff.ts";
import { launchRecipeWorkflow } from "./t3team-recipeWorkflowLaunch.ts";
import { T3TeamScriptHost } from "./t3team-scriptHostContext.ts";
import { NoopT3TeamToolBroker, T3TeamToolBroker } from "./t3team-toolBroker.ts";
import { threadMessages, waitUntil } from "./t3team-workflowEngineScenario.fixtures.ts";
import { T3TeamWorkflowEngineRegistry } from "./t3team-workflowEngineRegistry.ts";
import { T3TeamWorkflowSchedulerLive } from "./t3team-workflowScheduler.ts";
import {
  createWorkflowStubThread,
  makeWorkflowStubRuntime,
  seedWorkflowStubProject,
} from "./t3team-workflowStubRuntime.ts";
import { WORKFLOW_STUB_MODEL_SELECTION } from "./t3team-workflowStubAgentTurn.ts";

const workflowPath = NodeURL.fileURLToPath(
  new URL("../__fixtures__/t3team-decisionBoolean.workflow.ts", import.meta.url),
);
const sandbox = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3team-composer-kickoff-"));
afterAll(() => NodeFS.rmSync(sandbox, { recursive: true, force: true }));

const testLayer = () => {
  const stub = makeWorkflowStubRuntime({ name: "t3team-composer-kickoff", respond: () => "ok" });
  return Layer.mergeAll(
    T3TeamWorkflowSchedulerLive,
    Layer.succeed(T3TeamToolBroker, NoopT3TeamToolBroker),
    Layer.succeed(T3TeamScriptHost, { forRun: () => ({}) }),
    ServerConfig.layerTest(sandbox, { prefix: "t3-composer-kickoff-" }),
  ).pipe(Layer.provideMerge(stub.layer), Layer.provideMerge(NodeServices.layer));
};

const recipeKickoff = {
  recipeId: "release-check",
  title: "Release prüfen",
  workflowPath,
};

it.live("records the kickoff as a badged message and replies once the run is admitted", () =>
  Effect.gen(function* () {
    const projectId = "project-composer-kickoff";
    const threadId = ThreadId.make("thread-composer-kickoff");
    yield* seedWorkflowStubProject({ projectId, workspaceRoot: sandbox });
    yield* createWorkflowStubThread({ threadId, projectId });

    yield* recordComposerKickoffMessage({
      threadId,
      messageId: "kickoff-msg",
      text: "Nur Verträge ab 2025",
      recipeKickoff,
    });
    const launched = yield* launchRecipeWorkflow({
      threadId,
      recipePath: undefined,
      workflowPath,
      args: composerKickoffArgs({ question: "Ship it?" }, "Nur Verträge ab 2025"),
      modelSelection: createModelSelection(
        WORKFLOW_STUB_MODEL_SELECTION.instanceId,
        WORKFLOW_STUB_MODEL_SELECTION.model,
      ),
      runtimeMode: "full-access",
      interactionMode: "default",
      detach: true,
    });
    assert.strictEqual(launched.status, "accepted");

    const kickoff = (yield* threadMessages(threadId)).find(
      (message) => message.id === "kickoff-msg",
    );
    assert.strictEqual(kickoff?.role, "user");
    assert.strictEqual(kickoff?.text, "Nur Verträge ab 2025");
    assert.strictEqual(kickoff?.runId ?? null, null);
    assert.deepStrictEqual(
      readT3TeamMessageExtContext(kickoff?.context)?.recipeKickoff,
      recipeKickoff,
    );

    const registry = yield* T3TeamWorkflowEngineRegistry;
    yield* waitUntil(
      () => registry.peekPending(threadId)?.kind === "user.input",
      "the detached run to park on its ask",
    );
  }).pipe(Effect.scoped, Effect.provide(testLayer())),
);

it.live("refuses a kickoff for a thread that does not exist and records nothing", () =>
  Effect.gen(function* () {
    const error = yield* recordComposerKickoffMessage({
      threadId: ThreadId.make("thread-never-created"),
      messageId: "orphan-msg",
      text: "Hallo",
      recipeKickoff,
    }).pipe(Effect.flip);
    assert.include(String(error.message), "thread was not found");
  }).pipe(Effect.scoped, Effect.provide(testLayer())),
);

it("maps the typed text to the run's instructions and leaves empty text out", () => {
  assert.deepStrictEqual(composerKickoffArgs({ question: "Ship it?" }, "  Bitte prüfen "), {
    question: "Ship it?",
    instructions: "Bitte prüfen",
  });
  assert.deepStrictEqual(composerKickoffArgs({ question: "Ship it?" }, "  "), {
    question: "Ship it?",
  });
});
