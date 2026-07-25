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

const capture: { commands: unknown[]; agentPrompts: string[] } = {
  commands: [],
  agentPrompts: [],
};

const spec = {
  recipeDir,
  fixtureRoot,
  replies: readJsonFlag("replies", ["{}"]) as ReadonlyArray<string>,
  answers: readJsonFlag("answers", []) as ReadonlyArray<string>,
  args: readJsonFlag("args", {}),
  capture,
};

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
        // `scriptCalls` is the journal-derived invocation log, so a script the recipe declares
        // but never dispatches is now visible — and fails the gate. A recipe must not claim a
        // `scripts.*` handler it does not use.
        if (report.uncalledScripts.length > 0) {
          console.error(
            `declared but never called: ${report.uncalledScripts.join(", ")} ` +
              `(journaled calls: ${report.scriptCalls.join(", ") || "none"})`,
          );
          return 1;
        }
        return report.status === "completed" ? 0 : 1;
      }),
      Effect.catchCause((cause) =>
        Effect.sync(() => {
          console.error(String(cause));
          // On failure the capture is the only window into how far the body got:
          // which orchestration commands were dispatched, and what was asked.
          console.error(
            `capture: ${JSON.stringify(
              {
                commandTypes: capture.commands.map((c: { type?: string }) => c.type),
                agentPrompts: capture.agentPrompts.length,
              },
              null,
              2,
            )}`,
          );
          return 1;
        }),
      ),
    ),
  ),
);
process.exit(exitCode);
