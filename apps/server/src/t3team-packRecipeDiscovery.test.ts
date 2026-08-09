/* oxlint-disable t3code/no-manual-effect-runtime-in-tests -- Matches the sibling recipe-discovery tests. */
/**
 * Pack-provided recipes (Epic 16 §Scope + §Recipe Sources And Precedence): a pack that declares
 * `contents.recipes` gets those recipes discovered by the SAME pipeline as project-local ones,
 * labelled `source: "pack"`, with project-local winning an id collision.
 */
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { createQueryable } from "@t3tools/project-context";
import type { ProjectRecipeRenderContext } from "@t3tools/project-recipes";

import {
  loadPackRecipeSources,
  PACK_RECIPE_CAPABILITY,
  setPackRecipeSources,
} from "./t3team-packRecipeSources.ts";
import { discoverProjectRecipes } from "./t3team-projectRecipeDiscovery.ts";
import { makeBrokerLayer } from "./t3team-toolBrokerTestUtils.ts";

const orchestrationMock = {} as never;

const context: ProjectRecipeRenderContext = {
  surface: "project.dashboard.backlog",
  project: { title: "Project Alpha", provider: "atlassian" },
  linkedResources: createQueryable([]),
  artifacts: createQueryable([]),
  availableContextKeys: createQueryable([]),
  profile: {
    technicalDepth: "medium",
    brevity: "balanced",
    guidanceStyle: "guided",
  },
  enabledSkillPacks: [],
} as unknown as ProjectRecipeRenderContext;

const recipeJson = (id: string, displayName: string) =>
  JSON.stringify({
    id,
    version: "0.1.0",
    scope: "project",
    displayName,
    shortDescription: "A recipe.",
    surfaces: ["project.dashboard.backlog"],
    prompt: "./prompt.md",
  });

const writeRecipeDir = Effect.fn("writeRecipeDir")(function* (input: {
  readonly root: string;
  readonly id: string;
  readonly displayName: string;
}) {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  yield* fileSystem.makeDirectory(input.root, { recursive: true });
  yield* fileSystem.writeFileString(
    path.join(input.root, "recipe.json"),
    recipeJson(input.id, input.displayName),
  );
  yield* fileSystem.writeFileString(path.join(input.root, "prompt.md"), "Do the thing.");
});

const makePackDiagnostic = (input: {
  readonly directory: string;
  readonly recipes: ReadonlyArray<{ readonly id: string; readonly path: string }>;
  readonly capabilities?: ReadonlyArray<string>;
  readonly scope?: string;
}) =>
  ({
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
            scope: input.scope ?? "distribution",
            compatibility: { t3teamCore: "*" },
            contents: { recipes: input.recipes },
            capabilities: input.capabilities ?? [PACK_RECIPE_CAPABILITY],
            hashes: {},
          },
        },
      ],
      locks: {},
      diagnostics: [],
    },
  }) as never;

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test harness: services come from the merged layer below.
const run = <A>(effect: Effect.Effect<A, any, any>) =>
  Effect.runPromise(
    Effect.scoped(
      // @effect-diagnostics-next-line anyUnknownInErrorContext:off - Generic test runner: the suite passes any effect it builds and the layer below satisfies its requirements.
      effect.pipe(
        Effect.provide(Layer.mergeAll(makeBrokerLayer(orchestrationMock), NodeServices.layer)),
      ),
    ) as Effect.Effect<A, unknown, never>,
  );

afterEach(() => {
  setPackRecipeSources({ sources: [], diagnostics: [] });
});

describe("pack-provided recipe discovery", () => {
  it('discovers a pack recipe with source "pack" even without a .t3team/recipes folder', async () => {
    await run(
      Effect.gen(function* () {
        const fileSystem = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const packDir = yield* fileSystem.makeTempDirectoryScoped({ prefix: "t3team-pack-" });
        const workspaceRoot = yield* fileSystem.makeTempDirectoryScoped({ prefix: "t3team-ws-" });
        yield* writeRecipeDir({
          root: path.join(packDir, "recipes/triage"),
          id: "triage",
          displayName: "Triage the backlog",
        });

        setPackRecipeSources(
          loadPackRecipeSources(
            makePackDiagnostic({
              directory: packDir,
              recipes: [{ id: "triage", path: "recipes/triage" }],
            }),
          ),
        );

        const result = yield* discoverProjectRecipes({ workspaceRoot, context });
        expect(result.hasProjectLocalRecipes).toBe(false);
        expect(result.recipes).toHaveLength(1);
        expect(result.recipes[0]).toMatchObject({
          id: "triage",
          source: "pack",
          packId: "nexplore-global",
          packScope: "distribution",
          displayName: "Triage the backlog",
        });
      }),
    );
  });

  it("lets a project-local recipe override a pack recipe of the same id", async () => {
    await run(
      Effect.gen(function* () {
        const fileSystem = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const packDir = yield* fileSystem.makeTempDirectoryScoped({ prefix: "t3team-pack-" });
        const workspaceRoot = yield* fileSystem.makeTempDirectoryScoped({ prefix: "t3team-ws-" });
        yield* writeRecipeDir({
          root: path.join(packDir, "recipes/triage"),
          id: "triage",
          displayName: "Pack triage",
        });
        yield* writeRecipeDir({
          root: path.join(workspaceRoot, ".t3team/recipes/triage"),
          id: "triage",
          displayName: "Project triage",
        });

        setPackRecipeSources(
          loadPackRecipeSources(
            makePackDiagnostic({
              directory: packDir,
              recipes: [{ id: "triage", path: "recipes/triage" }],
            }),
          ),
        );

        const result = yield* discoverProjectRecipes({ workspaceRoot, context });
        expect(result.recipes).toHaveLength(1);
        expect(result.recipes[0]).toMatchObject({
          source: "project-local",
          displayName: "Project triage",
        });
        expect(result.diagnostics?.join(" ")).toContain("shadowed by project-local");
      }),
    );
  });

  it("keeps pack and project recipes with distinct ids side by side", async () => {
    await run(
      Effect.gen(function* () {
        const fileSystem = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const packDir = yield* fileSystem.makeTempDirectoryScoped({ prefix: "t3team-pack-" });
        const workspaceRoot = yield* fileSystem.makeTempDirectoryScoped({ prefix: "t3team-ws-" });
        yield* writeRecipeDir({
          root: path.join(packDir, "recipes/triage"),
          id: "triage",
          displayName: "Pack triage",
        });
        yield* writeRecipeDir({
          root: path.join(workspaceRoot, ".t3team/recipes/risk"),
          id: "risk",
          displayName: "Project risk",
        });

        setPackRecipeSources(
          loadPackRecipeSources(
            makePackDiagnostic({
              directory: packDir,
              recipes: [{ id: "triage", path: "recipes/triage" }],
            }),
          ),
        );

        const result = yield* discoverProjectRecipes({ workspaceRoot, context });
        expect(result.hasProjectLocalRecipes).toBe(true);
        expect(
          [...result.recipes].map((recipe) => `${recipe.id}:${recipe.source}`).toSorted(),
        ).toEqual(["risk:project-local", "triage:pack"]);
      }),
    );
  });

  it("ignores pack recipes when the pack lacks the recipe:v1 capability", () => {
    const load = loadPackRecipeSources(
      makePackDiagnostic({
        directory: "/packs/nexplore-global",
        recipes: [{ id: "triage", path: "recipes/triage" }],
        capabilities: ["theme:v1"],
      }),
    );
    expect(load.sources).toHaveLength(0);
    expect(load.diagnostics[0]).toContain(`without the ${PACK_RECIPE_CAPABILITY} capability`);
  });

  it("refuses a recipe path that escapes the pack directory", () => {
    const load = loadPackRecipeSources(
      makePackDiagnostic({
        directory: "/packs/nexplore-global",
        recipes: [
          { id: "escape", path: "../other-pack/recipes/x" },
          { id: "absolute", path: "/etc/recipes/x" },
        ],
      }),
    );
    expect(load.sources).toHaveLength(0);
    expect(load.diagnostics).toHaveLength(2);
    expect(load.diagnostics[0]).toContain("escapes its pack directory");
    expect(load.diagnostics[1]).toContain("must be relative");
  });

  it("evaluates a pack recipe's visible.ts against the USER's workspace, not the pack", async () => {
    await run(
      Effect.gen(function* () {
        const fileSystem = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const packDir = yield* fileSystem.makeTempDirectoryScoped({ prefix: "t3team-pack-" });
        const workspaceRoot = yield* fileSystem.makeTempDirectoryScoped({ prefix: "t3team-ws-" });
        const recipeRoot = path.join(packDir, "recipes/triage");
        yield* writeRecipeDir({ root: recipeRoot, id: "triage", displayName: "Pack triage" });
        // `visible` is authored inside the pack, but probes the user's project.
        yield* fileSystem.writeFileString(
          path.join(recipeRoot, "recipe.json"),
          // @effect-diagnostics-next-line preferSchemaOverJson:off - Test fixture writes a recipe.json manifest to disk verbatim; not a domain payload.
          JSON.stringify({
            id: "triage",
            version: "0.1.0",
            scope: "project",
            displayName: "Pack triage",
            shortDescription: "A recipe.",
            surfaces: ["project.dashboard.backlog"],
            prompt: "./prompt.md",
            visibleWhen: "./visible.ts",
          }),
        );
        yield* fileSystem.writeFileString(
          path.join(recipeRoot, "visible.ts"),
          [
            "export async function visible(_ctx, api) {",
            "  const marker = await api.workspace.exists('WORKSPACE_MARKER');",
            "  return { visible: marker, rank: 42, reason: api.workspace.rootPath };",
            "}",
          ].join("\n"),
        );

        setPackRecipeSources(
          loadPackRecipeSources(
            makePackDiagnostic({
              directory: packDir,
              recipes: [{ id: "triage", path: "recipes/triage" }],
            }),
          ),
        );

        // Decoy: a marker inside the pack recipe dir. If discovery wrongly used the pack as
        // `workspaceRoot`, this alone would make the recipe visible.
        yield* fileSystem.writeFileString(path.join(recipeRoot, "WORKSPACE_MARKER"), "decoy");
        const hidden = yield* discoverProjectRecipes({ workspaceRoot, context });
        expect(hidden.recipes).toHaveLength(0);

        yield* fileSystem.writeFileString(path.join(workspaceRoot, "WORKSPACE_MARKER"), "x");
        const shown = yield* discoverProjectRecipes({ workspaceRoot, context });
        expect(shown.recipes).toHaveLength(1);
        expect(shown.recipes[0]?.rank).toBe(42);
        // `workspace.rootPath` is the user's workspace, never the pack directory.
        expect(shown.recipes[0]?.reason).toBe(workspaceRoot);
        // While the recipe's own files still resolve inside the pack.
        expect(shown.recipes[0]?.recipePath).toBe(recipeRoot);
      }),
    );
  });

  it("drops a pack recipe whose authored id disagrees with the manifest", async () => {
    await run(
      Effect.gen(function* () {
        const fileSystem = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const packDir = yield* fileSystem.makeTempDirectoryScoped({ prefix: "t3team-pack-" });
        const workspaceRoot = yield* fileSystem.makeTempDirectoryScoped({ prefix: "t3team-ws-" });
        yield* writeRecipeDir({
          root: path.join(packDir, "recipes/triage"),
          id: "actually-something-else",
          displayName: "Pack triage",
        });

        setPackRecipeSources(
          loadPackRecipeSources(
            makePackDiagnostic({
              directory: packDir,
              recipes: [{ id: "triage", path: "recipes/triage" }],
            }),
          ),
        );

        const result = yield* discoverProjectRecipes({ workspaceRoot, context });
        expect(result.recipes).toHaveLength(0);
        expect(result.diagnostics?.join(" ")).toContain("declares recipe id triage");
      }),
    );
  });

  // Regression: a module that fails to load used to be dropped with NO diagnostic, so a whole
  // unloadable pack library was indistinguishable from an ordinary empty recipe list. The failure
  // must name the recipe, its path, and the underlying error.
  it("reports a diagnostic when a pack recipe module fails to load", async () => {
    await run(
      Effect.gen(function* () {
        const fileSystem = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const packDir = yield* fileSystem.makeTempDirectoryScoped({ prefix: "t3team-pack-" });
        const workspaceRoot = yield* fileSystem.makeTempDirectoryScoped({ prefix: "t3team-ws-" });
        const recipeRoot = path.join(packDir, "recipes/triage");
        yield* fileSystem.makeDirectory(recipeRoot, { recursive: true });
        // A `recipe.ts` whose bare import cannot resolve from the pack directory — exactly the
        // real-world failure (`@t3team/sdk` / `effect` not linked into the distro's node_modules).
        yield* fileSystem.writeFileString(
          path.join(recipeRoot, "recipe.ts"),
          'import { defineRecipe } from "@t3team/definitely-not-installed";\nexport default defineRecipe({});\n',
        );

        setPackRecipeSources(
          loadPackRecipeSources(
            makePackDiagnostic({
              directory: packDir,
              recipes: [{ id: "triage", path: "recipes/triage" }],
            }),
          ),
        );

        const result = yield* discoverProjectRecipes({ workspaceRoot, context });
        expect(result.recipes).toHaveLength(0);
        const diagnostics = result.diagnostics?.join(" ") ?? "";
        expect(diagnostics).toContain("recipe triage");
        expect(diagnostics).toContain(recipeRoot);
        expect(diagnostics).toContain("failed to load");
        expect(diagnostics).toContain("@t3team/definitely-not-installed");
      }),
    );
  });
});
