import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Layer from "effect/Layer";

import { ServerConfig } from "./config.ts";
import {
  harnessResponder,
  type T3TeamRecipeHarnessCapture,
} from "./t3team-recipeWorkflowHarnessStub.ts";
import { makeWorkflowStubRuntime } from "./t3team-workflowStubRuntime.ts";
import * as WorkspacePaths from "./workspace/WorkspacePaths.ts";

/**
 * The engine wiring the recipe harness runs on: the workflow engine over a real orchestration V2
 * runtime (`t3team-workflowStubRuntime.ts` — the same layers `server.ts` composes, over an
 * in-memory SQLite), plus the server config and workspace paths a recipe's scripts read. Only the
 * model is stubbed: workflow prompts consume `replies` in order, recorded into `capture`.
 */
export function makeT3TeamRecipeHarnessLayer(input: {
  readonly prefix: string;
  readonly replies: ReadonlyArray<string>;
  readonly capture: T3TeamRecipeHarnessCapture;
}) {
  const nodeLayer = NodeServices.layer;
  const runtime = makeWorkflowStubRuntime({
    name: input.prefix,
    respond: harnessResponder(input.replies, input.capture),
  });
  const config = ServerConfig.layerTest(process.cwd(), { prefix: input.prefix }).pipe(
    Layer.provide(nodeLayer),
  );
  return Layer.mergeAll(
    runtime.layer,
    WorkspacePaths.layer.pipe(Layer.provide(nodeLayer)),
    config,
    nodeLayer,
  );
}
