// @effect-diagnostics nodeBuiltinImport:off - the tests build a pack directory on disk.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { assert, describe, it } from "@effect/vitest";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { afterEach } from "vite-plus/test";

import { resolveKickoffRecipe } from "./t3team-kickoffRecipe.ts";
import { getPackRecipeSources, setPackRecipeSources } from "./t3team-packRecipeSources.ts";
import { activatePackRecipeSources } from "./t3team-packRecipeSourcesFromEnv.ts";

/** A packs dir holding one pack that declares `machine-setup` (and only its manifest: no activate.ts). */
const makePacksDir = (capabilities: ReadonlyArray<string>) => {
  const root = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "packs-"));
  const pack = NodePath.join(root, "nexplore-global");
  NodeFS.mkdirSync(NodePath.join(pack, "recipes", "machine-setup"), { recursive: true });
  NodeFS.writeFileSync(
    NodePath.join(pack, "pack.json"),
    JSON.stringify({
      id: "nexplore-global",
      version: "0.1.0",
      packApiVersion: 1,
      name: "Nexi",
      publisher: "Nexplore",
      scope: "distribution",
      compatibility: { t3teamCore: "0.x", hostCapabilities: [] },
      capabilities,
      hashes: {},
      contents: { recipes: [{ id: "machine-setup", path: "recipes/machine-setup" }] },
    }),
  );
  return { root, recipeRoot: NodePath.join(pack, "recipes", "machine-setup") };
};

const withEnv = (env: Record<string, string>) =>
  Effect.provide(Layer.succeed(ConfigProvider.ConfigProvider, ConfigProvider.fromEnv({ env })));

describe("activatePackRecipeSources", () => {
  afterEach(() => setPackRecipeSources({ sources: [], diagnostics: [] }));

  // The session case: the compiled-in distribution contributes no recipe sources, and the pack on
  // disk is named by T3TEAM_PACKS_DIR. The kickoff recipe must then resolve.
  it.effect("registers the recipes of the pack dir the environment names", () =>
    Effect.gen(function* () {
      const { root, recipeRoot } = makePacksDir(["recipe:v1"]);
      yield* activatePackRecipeSources.pipe(withEnv({ T3TEAM_PACKS_DIR: root }));
      const { sources } = getPackRecipeSources();
      assert.deepStrictEqual(
        sources.map((source) => [source.declaredId, source.recipeRoot]),
        [["machine-setup", recipeRoot]],
      );
      assert.strictEqual(resolveKickoffRecipe("machine-setup", sources), sources[0]);
    }),
  );

  it.effect("registers nothing without T3TEAM_PACKS_DIR", () =>
    Effect.gen(function* () {
      yield* activatePackRecipeSources.pipe(withEnv({}));
      assert.deepStrictEqual(getPackRecipeSources().sources, []);
    }),
  );

  it.effect("skips a pack that declares recipes without the recipe capability", () =>
    Effect.gen(function* () {
      const { root } = makePacksDir([]);
      yield* activatePackRecipeSources.pipe(withEnv({ T3TEAM_PACKS_DIR: root }));
      assert.deepStrictEqual(getPackRecipeSources().sources, []);
    }),
  );

  it.effect("survives a packs dir that does not exist", () =>
    Effect.gen(function* () {
      yield* activatePackRecipeSources.pipe(withEnv({ T3TEAM_PACKS_DIR: "/nonexistent/packs" }));
      assert.deepStrictEqual(getPackRecipeSources().sources, []);
    }),
  );

  // The `t3team` binary registers the full runtime pack before the server starts; its sources win.
  it.effect("keeps sources a runtime pack already registered", () =>
    Effect.gen(function* () {
      const registered = {
        packId: "runtime",
        packVersion: "1",
        packScope: "project",
        declaredId: "machine-setup",
        recipeRoot: "/runtime/machine-setup",
      } as const;
      setPackRecipeSources({ sources: [registered], diagnostics: [] });
      const { root } = makePacksDir(["recipe:v1"]);
      yield* activatePackRecipeSources.pipe(withEnv({ T3TEAM_PACKS_DIR: root }));
      assert.deepStrictEqual(getPackRecipeSources().sources, [registered]);
    }),
  );
});
