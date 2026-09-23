// @effect-diagnostics nodeBuiltinImport:off - resolves the real on-disk typescript the stage copies.
import * as NodeFS from "node:fs";
import * as NodeModule from "node:module";
import * as NodePath from "node:path";
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
        assert.isDefined(specs[name], name);
      }
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("declares the typescript @runbook/ts resolves, which ships typescript.d.ts", () =>
    Effect.gen(function* () {
      const workspaceCatalog = (yield* readWorkspaceConfig(repoRoot)).catalog ?? {};
      const specs = yield* readAuthoringTypeDependencySpecs({ repoRoot, workspaceCatalog });
      // stageAuthoringTypes copies lib/typescript.d.ts (a TYPECHECKER_DTS_FILES
      // entry) from this compiler; the staged manifest must declare the same one.
      const runbookTs = NodeModule.createRequire(
        NodePath.join(repoRoot, "packages", "runbook-ts", "package.json"),
      );
      const typescriptLibDir = NodePath.dirname(runbookTs.resolve("typescript"));
      const runbookTsManifest = runbookTs("./package.json") as {
        readonly dependencies: Record<string, string>;
      };
      assert.isTrue(NodeFS.existsSync(NodePath.join(typescriptLibDir, "typescript.d.ts")));
      assert.strictEqual(specs["typescript"], runbookTsManifest.dependencies["typescript"]);
    }).pipe(Effect.provide(NodeServices.layer)),
  );
});
