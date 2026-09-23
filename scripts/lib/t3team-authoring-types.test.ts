import * as NodeURL from "node:url";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { readWorkspaceConfig, TYPECHECKER_DTS_DIRECTORIES } from "../build-desktop-artifact.ts";
import { readAuthoringTypeDependencySpecs } from "./t3team-authoring-types.ts";

const repoRoot = NodeURL.fileURLToPath(new URL("../..", import.meta.url));

describe("readAuthoringTypeDependencySpecs", () => {
  it.effect("declares every node_modules package the asar .d.ts closure re-injects", () =>
    Effect.gen(function* () {
      const workspaceCatalog = (yield* readWorkspaceConfig(repoRoot)).catalog ?? {};
      const specs = yield* readAuthoringTypeDependencySpecs({ repoRoot, workspaceCatalog });
      // The staged install only carries declared dependencies (plus native
      // externals); an undeclared package here fails the afterPack hook with
      // "staged source directory missing".
      for (const directory of TYPECHECKER_DTS_DIRECTORIES) {
        if (!directory.startsWith("node_modules/")) continue;
        const name = directory.slice("node_modules/".length);
        assert.strictEqual(specs[name], workspaceCatalog[name], name);
      }
    }).pipe(Effect.provide(NodeServices.layer)),
  );
});
