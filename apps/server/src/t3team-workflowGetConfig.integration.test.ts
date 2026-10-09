// @effect-diagnostics nodeBuiltinImport:off - integration test writes a project's config files.
/**
 * `getConfig()` end to end on the real V2 orchestrator, engine and host: a recipe run reads its
 * config for one repository through the journaled `config.resolve` verb, and its resume replays
 * the recorded answer even after the config file changed.
 */
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

import { assert, it } from "@effect/vitest";
import { afterAll } from "vite-plus/test";
import { PROJECT_STATE_DIR } from "@t3tools/project-context/t3teamProjectStateDir";
import { ProjectId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import {
  launchScenarioWorkflow,
  typeUserMessage,
  waitUntil,
} from "./t3team-workflowEngineScenario.fixtures.ts";
import { T3TeamWorkflowEngineRegistry } from "./t3team-workflowEngineRegistry.ts";
import {
  createWorkflowStubThread,
  makeWorkflowStubRuntime,
  seedWorkflowStubProject,
} from "./t3team-workflowStubRuntime.ts";

const here = NodeURL.fileURLToPath(new URL(".", import.meta.url));
const fixture = NodePath.join(here, "../__fixtures__/t3team-getConfig.workflow.ts");
// Under __fixtures__ so the config's `import … from "@t3team/sdk"` resolves through the repo.
const workspaceRoot = NodeFS.mkdtempSync(NodePath.join(here, "../__fixtures__/t3team-get-config-"));
afterAll(() => NodeFS.rmSync(workspaceRoot, { recursive: true, force: true }));

const recipes = NodePath.join(workspaceRoot, PROJECT_STATE_DIR, "recipes");
const recipePath = NodePath.join(recipes, "pr-watch");
const writeConfig = (model: string) =>
  NodeFS.writeFileSync(
    NodePath.join(recipes, "pr-watch.config.ts"),
    [
      `import { defineRecipeConfig } from "@t3team/sdk";`,
      `export default defineRecipeConfig("pr-watch", {`,
      `  defaults: { model: "${model}" },`,
      `  scopes: [{ repos: ["hive/*"], autoMerge: ["pin-bump"] }],`,
      `});`,
    ].join("\n"),
  );

it.live("reads the recipe config, and replays the recorded answer after the file changed", () => {
  const runtime = makeWorkflowStubRuntime({ name: "t3team-get-config", respond: () => "ok" });
  return Effect.gen(function* () {
    NodeFS.mkdirSync(recipePath, { recursive: true });
    writeConfig("nexplore/conductor");
    const projectId = ProjectId.make("project:get-config");
    const launchThreadId = "thread:get-config:launch";
    yield* seedWorkflowStubProject({ projectId, workspaceRoot });
    yield* createWorkflowStubThread({ threadId: launchThreadId, projectId });
    const registry = yield* T3TeamWorkflowEngineRegistry;
    const run = yield* launchScenarioWorkflow({
      runId: "get-config-run",
      workflowPath: fixture,
      launchThreadId,
      projectId,
      runsRoot: NodePath.join(workspaceRoot, ".t3team-runs"),
      recipePath,
    });
    yield* waitUntil(
      () => registry.peekPending(launchThreadId)?.kind === "user.input" || run.errors.length > 0,
      "the run to park on its question",
    );
    assert.deepStrictEqual(run.errors, []);
    // The file changes while the run is parked; the resume must not see it.
    writeConfig("claude/opus");
    yield* typeUserMessage(launchThreadId, '{"go":true}', "go");
    yield* waitUntil(() => run.completed.length > 0 || run.errors.length > 0, "the run to end");
    assert.deepStrictEqual(run.errors, []);
    assert.deepStrictEqual(run.completed[0], {
      model: "nexplore/conductor",
      autoMerge: ["pin-bump"],
      language: "de",
      modelSource: { layer: "defaults", line: 3 },
      warnings: 0,
    });
  }).pipe(Effect.provide(runtime.layer));
});
