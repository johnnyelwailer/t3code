/**
 * Recipe/orchestration E2E runner.
 *
 * Launches one recipe workflow against a fixture-backed project on the real engine with a
 * stubbed model, and prints a JSON report the caller asserts on. Browser-free and offline, so
 * a distribution repo (or CI) can exercise its recipe library unattended:
 *
 *   node vendor/t3code/scripts/t3work-recipe-workflow-e2e.ts \
 *     --recipe packs/nexplore-global/recipes/discussion-recap \
 *     --fixture fixtures/demo-backlog \
 *     --replies '["{\"decisions\":[]}"]' --answers '["{}"]'
 */
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { runT3workRecipeWorkflowHarness } from "../apps/server/src/t3work-recipeWorkflowHarness.ts";
import {
  makeT3workRecipeHarnessEngineLayer,
  makeT3workRecipeHarnessReactorLayer,
} from "../apps/server/src/t3work-recipeWorkflowHarnessLayers.ts";
import { makeT3workRecipeHarnessStubProvider } from "../apps/server/src/t3work-recipeWorkflowHarnessStub.ts";

function readFlag(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function readJsonFlag(name: string, fallback: unknown): unknown {
  const raw = readFlag(name);
  return raw === undefined ? fallback : JSON.parse(raw);
}

const recipeDir = readFlag("recipe");
const fixtureRoot = readFlag("fixture");
if (!recipeDir || !fixtureRoot) {
  console.error("usage: --recipe <dir> --fixture <dir> [--replies <json>] [--answers <json>]");
  process.exit(2);
}

const spec = {
  recipeDir,
  fixtureRoot,
  replies: readJsonFlag("replies", ["{}"]) as ReadonlyArray<string>,
  answers: readJsonFlag("answers", []) as ReadonlyArray<string>,
  args: readJsonFlag("args", {}),
};

const capture = { commands: [], agentPrompts: [] };
const layer = Layer.mergeAll(
  makeT3workRecipeHarnessReactorLayer(),
  makeT3workRecipeHarnessStubProvider({ replies: spec.replies, capture }),
).pipe(Layer.provideMerge(makeT3workRecipeHarnessEngineLayer("t3work-recipe-e2e-")));

const exitCode = await Effect.runPromise(
  Effect.scoped(
    runT3workRecipeWorkflowHarness(spec).pipe(
      Effect.provide(layer),
      Effect.map((report) => {
        console.log(JSON.stringify(report, null, 2));
        return report.status === "completed" ? 0 : 1;
      }),
      Effect.catchCause((cause) =>
        Effect.sync(() => {
          console.error(String(cause));
          return 1;
        }),
      ),
    ),
  ),
);
process.exit(exitCode);
