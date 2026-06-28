// @effect-diagnostics nodeBuiltinImport:off - fixture test uses real temp files.
import { assert, it } from "@effect/vitest";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";

import { loadT3workContextRefreshScope } from "./t3work-contextRefreshScope.ts";
import {
  makeContextRefreshScopeTestLayer,
  makeContextRefreshTestWorkspace,
  registerContextRefreshTestCleanup,
} from "./t3work-contextRefreshTestFixtures.ts";

registerContextRefreshTestCleanup();

it.effect("loadT3workContextRefreshScope rejects mismatched project_id", () =>
  Effect.gen(function* () {
    const { root } = makeContextRefreshTestWorkspace({ projectId: "project-1" });
    const exit = yield* loadT3workContextRefreshScope({
      workspaceRoot: root,
      requestedKey: "AC-91",
      projectId: "project-other",
      force: false,
    }).pipe(Effect.exit);
    assert.isTrue(Exit.isFailure(exit));
    if (Exit.isFailure(exit)) {
      assert.match(
        String(Cause.squash(exit.cause)),
        /does not match workspace project 'project-1'/,
      );
    }
  }).pipe(Effect.provide(makeContextRefreshScopeTestLayer())),
);

it.effect("loadT3workContextRefreshScope accepts matching project_id", () =>
  Effect.gen(function* () {
    const { root, project } = makeContextRefreshTestWorkspace({ projectId: "project-1" });
    const scope = yield* loadT3workContextRefreshScope({
      workspaceRoot: root,
      requestedKey: "AC-91",
      projectId: project.id,
      force: false,
    });
    assert.equal(scope.project.id, project.id);
    assert.equal(scope.canonicalKey, "ac-91");
  }).pipe(Effect.provide(makeContextRefreshScopeTestLayer())),
);
