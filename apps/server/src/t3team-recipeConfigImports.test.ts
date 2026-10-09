import { assert, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import { collectConfigImports } from "./t3team-recipeConfigImports.ts";

it.layer(NodeServices.layer)("config import graph", (it) => {
  it.effect("follows relative imports transitively and flags files outside the state dir", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fileSystem.makeTempDirectoryScoped({ prefix: "t3team-config-imports-" });
      const state = path.join(root, ".nexi");
      const write = (relative: string, text: string) =>
        Effect.gen(function* () {
          yield* fileSystem.makeDirectory(path.dirname(path.join(root, relative)), {
            recursive: true,
          });
          yield* fileSystem.writeFileString(path.join(root, relative), text);
        });
      yield* write(
        ".nexi/recipes/pr-watch.config.ts",
        [
          'import { defineRecipeConfig } from "@t3team/sdk";',
          'import type X from "./types.ts";',
          'import ownership from "../policies/ownership.ts";',
        ].join("\n"),
      );
      yield* write(".nexi/recipes/types.ts", "export type X = 1;");
      yield* write(
        ".nexi/policies/ownership.ts",
        'import { helper } from "./helpers/deep.ts";\nexport { other } from "../../outside.ts";',
      );
      yield* write(".nexi/policies/helpers/deep.ts", "export const helper = 1;");
      yield* write("outside.ts", "export const other = 1;");

      const graph = yield* collectConfigImports(
        path.join(state, "recipes/pr-watch.config.ts"),
        state,
      );
      assert.deepStrictEqual(
        graph.files.map((file) => path.relative(root, file)),
        [
          ".nexi/recipes/pr-watch.config.ts",
          ".nexi/recipes/types.ts",
          ".nexi/policies/ownership.ts",
          ".nexi/policies/helpers/deep.ts",
          "outside.ts",
        ],
      );
      assert.deepStrictEqual(
        graph.outside.map((file) => path.relative(root, file)),
        ["outside.ts"],
      );
    }),
  );
});
