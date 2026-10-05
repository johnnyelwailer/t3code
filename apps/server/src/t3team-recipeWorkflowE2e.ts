// @effect-diagnostics globalConsole:off - CLI runner: stdout IS its contract (callers parse the JSON report); Effect's logger would add framing.
// @effect-diagnostics globalConsoleInEffect:off - Same reason inside the Effect body: the failure path writes diagnostics to stderr for a human.
// @effect-diagnostics preferSchemaOverJson:off - Argv flags and the stdout report are untyped process boundaries, not domain payloads.
/**
 * Recipe/orchestration E2E runner.
 *
 * Launches one recipe workflow against a fixture-backed project on the real engine with a
 * stubbed model, and prints a JSON report the caller asserts on. Browser-free and offline, so
 * a distribution repo (or CI) can exercise its recipe library unattended:
 *
 *   node vendor/t3code/apps/server/src/t3team-recipeWorkflowE2e.ts \
 *     --recipe packs/<pack>/recipes/discussion-recap \
 *     --fixture fixtures/demo-backlog \
 *     --replies '["{\"decisions\":[]}"]' --answers '["{}"]'
 *
 * Lives in `apps/server/src` rather than `scripts/` because it imports server internals: the
 * `scripts` tsconfig project does not (and should not) own those files, so from there every
 * import tripped TS6307 and dragged the server sources into the wrong project, cascading
 * ~150 spurious errors through CI's `vpr typecheck`.
 *
 * @module t3team-recipeWorkflowE2e
 */
import * as Effect from "effect/Effect";

import { runT3TeamRecipeWorkflowHarness } from "./t3team-recipeWorkflowHarness.ts";
import { makeT3TeamRecipeHarnessLayer } from "./t3team-recipeWorkflowHarnessLayers.ts";
import type { T3TeamRecipeHarnessCapture } from "./t3team-recipeWorkflowHarnessStub.ts";

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

const capture: T3TeamRecipeHarnessCapture = { operations: [], agentPrompts: [] };

const spec = {
  recipeDir,
  fixtureRoot,
  answers: readJsonFlag("answers", []) as ReadonlyArray<string>,
  args: readJsonFlag("args", {}),
  capture,
};

const layer = makeT3TeamRecipeHarnessLayer({
  prefix: "t3team-recipe-e2e-",
  replies: readJsonFlag("replies", ["{}"]) as ReadonlyArray<string>,
  capture,
});

const exitCode = await Effect.runPromise(
  Effect.scoped(
    runT3TeamRecipeWorkflowHarness(spec).pipe(
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
          // which host operations the run performed, and what was asked.
          console.error(
            `capture: ${JSON.stringify(
              {
                hostOperations: capture.operations.map(({ op }) => op),
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
