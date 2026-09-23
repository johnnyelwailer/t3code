/**
 * Workflow `agent()` auto-latest model routing (`NEXI_FF_AUTO_LATEST_MODEL`, default ON): a
 * stale explicit step model is routed against the live provider catalog before the child is
 * created and its turn starts, and the step activity journals requested vs effective.
 *
 * Drives the real broker + real step-activity emitter (same shape as the explicit-model case in
 * `t3team-workflowEngineBroker.test.ts`), so the assertions are on the dispatched commands.
 */
import {
  type OrchestrationCommand,
  ProjectId,
  ProviderInstanceId,
  type ServerProvider,
} from "@t3tools/contracts";
import { createModelSelection } from "@t3tools/shared/model";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

import { AUTO_LATEST_MODEL_FLAG_ENV } from "./t3team-autoLatestModelFlag.ts";
import { setChildProviderCatalog } from "./t3team-childProviderCatalog.ts";
import { createWorkflowEngineBroker } from "./t3team-workflowEngineBroker.ts";
import { makeWorkflowEngineRegistry } from "./t3team-workflowEngineRegistry.ts";
import { createWorkflowStepActivityEmitter } from "./t3team-workflowEngineStepActivities.ts";

const openai = {
  instanceId: "openai",
  driver: "openai",
  enabled: true,
  installed: true,
  models: ["gpt-5.6-sol", "gpt-6-sol", "gpt-6-astra"].map((slug) => ({
    slug,
    name: slug,
    isCustom: false,
    capabilities: null,
  })),
} as unknown as ServerProvider;

const staleModel = {
  provider: "openai",
  model: { kind: "model" as const, id: "gpt-5.6-sol", provider: "openai" },
};

function makeBroker() {
  const registry = makeWorkflowEngineRegistry();
  const dispatched: OrchestrationCommand[] = [];
  const dispatch = async (command: OrchestrationCommand) => void dispatched.push(command);
  const common = { newId: () => "id-1", nowIso: () => "2026-01-01T00:00:00.000Z", dispatch };
  const broker = createWorkflowEngineBroker({
    ...common,
    runId: "run-route",
    launchThreadId: "parent-1",
    projectId: ProjectId.make("project-1"),
    modelSelection: createModelSelection(ProviderInstanceId.make("openai"), "gpt-6-astra"),
    runtimeMode: "full-access",
    interactionMode: "default",
    registry,
    stepActivities: createWorkflowStepActivityEmitter({
      ...common,
      runId: "run-route",
      projectId: "project-1",
      launchThreadId: "parent-1",
    }),
  });
  return { broker, registry, dispatched };
}

const stepRouting = (dispatched: readonly OrchestrationCommand[], stepKind: string) =>
  dispatched.flatMap((command) =>
    command.type === "thread.activity.append" &&
    (command.activity.payload as { stepKind?: string }).stepKind === stepKind
      ? [(command.activity.payload as { modelRouting?: unknown }).modelRouting]
      : [],
  );

const previousFlag = process.env[AUTO_LATEST_MODEL_FLAG_ENV];
beforeEach(() => {
  delete process.env[AUTO_LATEST_MODEL_FLAG_ENV];
  setChildProviderCatalog(async () => [openai]);
});
afterEach(() => {
  setChildProviderCatalog(undefined);
  if (previousFlag === undefined) delete process.env[AUTO_LATEST_MODEL_FLAG_ENV];
  else process.env[AUTO_LATEST_MODEL_FLAG_ENV] = previousFlag;
});

const routed = {
  requested: "gpt-5.6-sol",
  effective: "gpt-6-sol",
  routed: true,
  reason: "same-tier-newer",
};

async function runAgentStep(broker: ReturnType<typeof makeBroker>) {
  await broker.broker.send(
    {
      correlationId: "run-route:1",
      kind: "thread.create",
      payload: { threadId: "child-1", name: "Review", model: staleModel },
    },
    { resolve: () => {}, reject: () => {} },
  );
  const turn = broker.broker.send(
    {
      correlationId: "run-route:2",
      kind: "thread.turn",
      payload: { threadId: "child-1", prompt: "Review", model: staleModel },
    },
    { resolve: () => {}, reject: () => {} },
  );
  // The explicit model resolves before pending state is recorded — poll for it.
  let pending = broker.registry.takePending("child-1");
  for (let attempt = 0; pending === undefined && attempt < 50; attempt += 1) {
    await Promise.resolve();
    pending = broker.registry.takePending("child-1");
  }
  expect(pending).toBeDefined();
  await pending!.resolveLive?.("done");
  await turn;
}

describe("workflow agent() auto-latest model routing", () => {
  it("creates the child and starts its turn on the routed model, journaling the routing", async () => {
    const harness = makeBroker();
    await runAgentStep(harness);

    const create = harness.dispatched.find((command) => command.type === "thread.create");
    const start = harness.dispatched.find((command) => command.type === "thread.turn.start");
    expect(create).toMatchObject({ modelSelection: { instanceId: "openai", model: "gpt-6-sol" } });
    expect(start).toMatchObject({ modelSelection: { instanceId: "openai", model: "gpt-6-sol" } });

    // Every emission of both steps (sent AND resolved) carries the record.
    expect(stepRouting(harness.dispatched, "thread.create")).toEqual([routed]);
    const turnRouting = stepRouting(harness.dispatched, "thread.turn");
    expect(turnRouting.length).toBeGreaterThan(0);
    for (const entry of turnRouting) expect(entry).toEqual(routed);
  });

  it("flag off: executes the requested slug and journals why it was not routed", async () => {
    process.env[AUTO_LATEST_MODEL_FLAG_ENV] = "0";
    const harness = makeBroker();
    await runAgentStep(harness);

    const start = harness.dispatched.find((command) => command.type === "thread.turn.start");
    expect(start).toMatchObject({ modelSelection: { model: "gpt-5.6-sol" } });
    expect(stepRouting(harness.dispatched, "thread.turn")[0]).toMatchObject({
      routed: false,
      reason: "flag-off",
    });
  });
});
