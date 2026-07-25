/* oxlint-disable t3code/no-manual-effect-runtime-in-tests -- Matches the sibling recipe agent-tool tests. */
/**
 * The agent-facing recipe tools must see PACK-SHIPPED recipes, not just `.t3team/recipes/*`.
 *
 * The library the system prompt tells the model to prefer ("run a fitting saved recipe by `path`
 * rather than re-authoring it") ships as pack content, so a `t3team_recipe_list` that enumerated
 * only project-local recipes made that advice unactionable — and `t3team_recipe_validate` rejected
 * the pack paths outright, because containment was checked against the workspace root alone.
 */
import * as NodeURL from "node:url";

import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import type * as Scope from "effect/Scope";
import { afterEach, describe, expect, it } from "vite-plus/test";

import {
  loadPackRecipeSources,
  PACK_RECIPE_CAPABILITY,
  setPackRecipeSources,
} from "./t3team-packRecipeSources.ts";
import { listProjectRecipesForAgent } from "./t3team-recipeAgentList.ts";
import { validateProjectRecipeWorkflowForAgent } from "./t3team-recipeAgentValidate.ts";

const fixturesRoot = NodeURL.fileURLToPath(new URL("../__fixtures__/", import.meta.url));

const makeTempDir = Effect.fn("makeTempDir")(function* (prefix: string) {
  const fileSystem = yield* FileSystem.FileSystem;
  return yield* fileSystem.makeTempDirectoryScoped({ directory: fixturesRoot, prefix });
});

const WORKFLOW_SOURCE = [
  `export const meta = { name: "triage.workflow", description: "Triage the backlog." } as const;`,
  `return { done: true };`,
].join("\n");

/** A `recipe.json` recipe directory — no module resolution needed, so it works inside a pack dir. */
const writeRecipeDir = Effect.fn("writeRecipeDir")(function* (input: {
  readonly root: string;
  readonly id: string;
  readonly displayName: string;
  readonly withWorkflow?: boolean;
}) {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  yield* fileSystem.makeDirectory(input.root, { recursive: true });
  yield* fileSystem.writeFileString(path.join(input.root, "prompt.md"), "Do the thing.");
  if (input.withWorkflow) {
    yield* fileSystem.writeFileString(path.join(input.root, "triage.workflow.ts"), WORKFLOW_SOURCE);
  }
  yield* fileSystem.writeFileString(
    path.join(input.root, "recipe.json"),
    [
      `{`,
      `  "id": "${input.id}",`,
      `  "version": "0.1.0",`,
      `  "scope": "project",`,
      `  "displayName": "${input.displayName}",`,
      `  "shortDescription": "A recipe.",`,
      `  "surfaces": ["project.dashboard.backlog"],`,
      ...(input.withWorkflow ? [`  "workflow": "./triage.workflow.ts",`] : []),
      `  "prompt": "./prompt.md"`,
      `}`,
    ].join("\n"),
  );
});

const registerPack = (input: {
  readonly directory: string;
  readonly recipes: ReadonlyArray<{ readonly id: string; readonly path: string }>;
}) =>
  setPackRecipeSources(
    loadPackRecipeSources({
      enabled: true,
      root: "/packs",
      issues: [],
      resolution: {
        packs: [
          {
            directory: input.directory,
            manifest: {
              id: "nexplore-global",
              version: "0.1.0",
              packApiVersion: 1,
              name: "Nexplore Global",
              scope: "distribution",
              compatibility: { t3teamCore: "*" },
              contents: { recipes: input.recipes },
              capabilities: [PACK_RECIPE_CAPABILITY],
              hashes: {},
            },
          },
        ],
        locks: {},
        diagnostics: [],
      },
    } as never),
  );

const run = <A, E>(effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path | Scope.Scope>) =>
  Effect.runPromise(Effect.scoped(effect.pipe(Effect.provide(NodeServices.layer))));

afterEach(() => {
  setPackRecipeSources({ sources: [], diagnostics: [] });
});

describe("listProjectRecipesForAgent with pack-shipped recipes", () => {
  it("returns a pack recipe with its source label and a usable path, with no project-local recipes at all", async () => {
    await run(
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const packDir = yield* makeTempDir("t3team-agent-list-pack-");
        const workspaceRoot = yield* makeTempDir("t3team-agent-list-ws-");
        const recipeRoot = path.join(packDir, "recipes/triage");
        yield* writeRecipeDir({
          root: recipeRoot,
          id: "triage",
          displayName: "Triage the backlog",
          withWorkflow: true,
        });
        registerPack({ directory: packDir, recipes: [{ id: "triage", path: "recipes/triage" }] });

        const result = yield* listProjectRecipesForAgent({ workspaceRoot });

        expect(result.ok).toBe(true);
        expect(result.recipes).toHaveLength(1);
        expect(result.recipes[0]).toMatchObject({
          id: "triage",
          title: "Triage the backlog",
          authoring: "recipe-json",
          source: "pack",
          packId: "nexplore-global",
          packScope: "distribution",
          recipePath: recipeRoot,
          workflowPath: path.join(recipeRoot, "triage.workflow.ts"),
        });
        expect(result.errors).toEqual([]);

        // The path the agent was handed must actually be runnable/validatable.
        const validated = yield* validateProjectRecipeWorkflowForAgent({
          workspaceRoot,
          path: result.recipes[0]!.recipePath,
        });
        expect(validated.errors).toEqual([]);
        expect(validated.ok).toBe(true);
        expect(validated.workflowPath).toBe(path.join(recipeRoot, "triage.workflow.ts"));
      }),
    );
  });

  it("keeps project-local recipes and lets one shadow a same-id pack recipe, with a diagnostic", async () => {
    await run(
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const packDir = yield* makeTempDir("t3team-agent-list-pack-");
        const workspaceRoot = yield* makeTempDir("t3team-agent-list-ws-");
        yield* writeRecipeDir({
          root: path.join(packDir, "recipes/triage"),
          id: "triage",
          displayName: "Pack triage",
        });
        yield* writeRecipeDir({
          root: path.join(packDir, "recipes/audit"),
          id: "audit",
          displayName: "Pack audit",
        });
        yield* writeRecipeDir({
          root: path.join(workspaceRoot, ".t3team/recipes/triage"),
          id: "triage",
          displayName: "Project triage",
        });
        registerPack({
          directory: packDir,
          recipes: [
            { id: "triage", path: "recipes/triage" },
            { id: "audit", path: "recipes/audit" },
          ],
        });

        const result = yield* listProjectRecipesForAgent({ workspaceRoot });

        expect(result.recipes.map((recipe) => `${recipe.id}:${recipe.source}`)).toEqual([
          "audit:pack",
          "triage:project-local",
        ]);
        const triage = result.recipes.find((recipe) => recipe.id === "triage");
        expect(triage?.title).toBe("Project triage");
        expect(triage?.recipePath).toBe(path.join(workspaceRoot, ".t3team/recipes/triage"));
        expect(triage?.packId).toBeUndefined();
        expect(result.diagnostics?.join(" ")).toContain("shadowed by project-local");
      }),
    );
  });

  it("reports a pack recipe that is declared but not on disk as a diagnostic", async () => {
    await run(
      Effect.gen(function* () {
        const packDir = yield* makeTempDir("t3team-agent-list-pack-");
        const workspaceRoot = yield* makeTempDir("t3team-agent-list-ws-");
        registerPack({ directory: packDir, recipes: [{ id: "ghost", path: "recipes/ghost" }] });

        const result = yield* listProjectRecipesForAgent({ workspaceRoot });

        expect(result.recipes).toEqual([]);
        expect(result.diagnostics?.join(" ")).toContain("recipe ghost is missing");
      }),
    );
  });

  it("still refuses a path outside both the workspace and every pack recipe root", async () => {
    await run(
      Effect.gen(function* () {
        const workspaceRoot = yield* makeTempDir("t3team-agent-list-ws-");

        const result = yield* validateProjectRecipeWorkflowForAgent({
          workspaceRoot,
          path: "../../../etc/passwd",
        });

        expect(result.ok).toBe(false);
        expect(result.errors[0]?.phase).toBe("discover");
        expect(result.errors[0]?.message).toContain("resolves outside");
      }),
    );
  });
});
