/* oxlint-disable t3code/no-manual-effect-runtime-in-tests -- Matches the sibling recipe agent-tool tests. */
// @effect-diagnostics nodeBuiltinImport:off - symlink escape cases need real symlinks on disk.
/**
 * Execution authorization for `t3team.orchestration.run`. A pack's recipe root is NOT an
 * execute-anything directory: containment made every `.ts` a pack ships runnable, and shadowing did
 * not stop it. These tests pin the identity rule, the symlink escapes lexical containment waved
 * through, and the deliberate read-only asymmetry (validate accepts what run refuses).
 */
import * as NodeFS from "node:fs";
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
import { resolveRunWorkflowPath } from "./t3team-workflowRunPathAuthorize.ts";

const fixturesRoot = NodeURL.fileURLToPath(new URL("../__fixtures__/", import.meta.url));

const WORKFLOW_SOURCE = [
  `export const meta = { name: "triage.workflow", description: "Triage the backlog." } as const;`,
  `return { done: true };`,
].join("\n");

const makeTempDir = Effect.fn("makeTempDir")(function* (prefix: string) {
  const fileSystem = yield* FileSystem.FileSystem;
  return yield* fileSystem.makeTempDirectoryScoped({ directory: fixturesRoot, prefix });
});

const writeRecipeDir = Effect.fn("writeRecipeDir")(function* (input: {
  readonly root: string;
  readonly id: string;
  readonly displayName: string;
  readonly extraWorkflows?: ReadonlyArray<string>;
}) {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  yield* fileSystem.makeDirectory(input.root, { recursive: true });
  yield* fileSystem.writeFileString(path.join(input.root, "prompt.md"), "Do the thing.");
  yield* fileSystem.writeFileString(path.join(input.root, "triage.workflow.ts"), WORKFLOW_SOURCE);
  for (const extra of input.extraWorkflows ?? []) {
    const extraPath = path.join(input.root, extra);
    yield* fileSystem.makeDirectory(path.dirname(extraPath), { recursive: true });
    yield* fileSystem.writeFileString(extraPath, WORKFLOW_SOURCE);
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
      `  "workflow": "./triage.workflow.ts",`,
      `  "prompt": "./prompt.md"`,
      `}`,
    ].join("\n"),
  );
});

const registerPack = (input: {
  readonly directory: string;
  readonly recipes: ReadonlyArray<{ readonly id: string; readonly path: string }>;
  readonly scope?: string;
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
              scope: input.scope ?? "distribution",
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

const authorize = Effect.fn("authorize")(function* (input: {
  readonly workspaceRoot: string;
  readonly workflowPath?: string;
  readonly source?: string;
  readonly runId?: string;
}) {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  return yield* resolveRunWorkflowPath({
    fileSystem,
    path,
    workspaceRoot: input.workspaceRoot,
    runId: input.runId ?? "run-1",
    args: {
      ...(input.workflowPath === undefined ? {} : { workflowPath: input.workflowPath }),
      ...(input.source === undefined ? {} : { source: input.source }),
    },
  }).pipe(Effect.result);
});

const run = <A, E>(effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path | Scope.Scope>) =>
  Effect.runPromise(Effect.scoped(effect.pipe(Effect.provide(NodeServices.layer))));

afterEach(() => {
  setPackRecipeSources({ sources: [], diagnostics: [] });
});

describe("resolveRunWorkflowPath — execution authorization", () => {
  it("runs a pack recipe's DECLARED workflow but refuses another .ts under the same recipe root", async () => {
    await run(
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const packDir = yield* makeTempDir("t3team-run-auth-pack-");
        const workspaceRoot = yield* makeTempDir("t3team-run-auth-ws-");
        const recipeRoot = path.join(packDir, "recipes/triage");
        yield* writeRecipeDir({
          root: recipeRoot,
          id: "triage",
          displayName: "Triage",
          extraWorkflows: ["internal/migration.workflow.ts", "test-fixtures/x.ts"],
        });
        registerPack({ directory: packDir, recipes: [{ id: "triage", path: "recipes/triage" }] });

        const declared = yield* authorize({
          workspaceRoot,
          workflowPath: path.join(recipeRoot, "triage.workflow.ts"),
        });
        expect(declared._tag).toBe("Success");
        if (declared._tag === "Success") {
          expect(declared.success).toBe(path.join(recipeRoot, "triage.workflow.ts"));
        }

        for (const undeclared of ["internal/migration.workflow.ts", "test-fixtures/x.ts"]) {
          const target = path.join(recipeRoot, undeclared);
          expect(NodeFS.existsSync(target)).toBe(true);
          const refused = yield* authorize({ workspaceRoot, workflowPath: target });
          expect(refused._tag).toBe("Failure");

          // Read-only surfaces intentionally still accept the same in-pack path.
          const validated = yield* validateProjectRecipeWorkflowForAgent({
            workspaceRoot,
            path: target,
          });
          expect(validated.ok).toBe(true);
        }
      }),
    );
  });

  it("refuses a SHADOWED pack recipe's workflow while the project-local one stays runnable", async () => {
    await run(
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const packDir = yield* makeTempDir("t3team-run-auth-pack-");
        const workspaceRoot = yield* makeTempDir("t3team-run-auth-ws-");
        const packRecipeRoot = path.join(packDir, "recipes/triage");
        const localRecipeRoot = path.join(workspaceRoot, ".t3team/recipes/triage");
        yield* writeRecipeDir({ root: packRecipeRoot, id: "triage", displayName: "Pack triage" });
        yield* writeRecipeDir({
          root: localRecipeRoot,
          id: "triage",
          displayName: "Project triage",
        });
        registerPack({ directory: packDir, recipes: [{ id: "triage", path: "recipes/triage" }] });

        const listed = yield* listProjectRecipesForAgent({ workspaceRoot });
        expect(listed.diagnostics?.join(" ")).toContain("shadowed by project-local");

        const shadowed = yield* authorize({
          workspaceRoot,
          workflowPath: path.join(packRecipeRoot, "triage.workflow.ts"),
        });
        expect(shadowed._tag).toBe("Failure");

        const local = yield* authorize({
          workspaceRoot,
          workflowPath: path.join(localRecipeRoot, "triage.workflow.ts"),
        });
        expect(local._tag).toBe("Success");
      }),
    );
  });

  it("refuses a remote-managed pack recipe's workflow (no signing/policy locks yet)", async () => {
    await run(
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const packDir = yield* makeTempDir("t3team-run-auth-pack-");
        const workspaceRoot = yield* makeTempDir("t3team-run-auth-ws-");
        const recipeRoot = path.join(packDir, "recipes/triage");
        yield* writeRecipeDir({ root: recipeRoot, id: "triage", displayName: "Triage" });
        registerPack({
          directory: packDir,
          recipes: [{ id: "triage", path: "recipes/triage" }],
          scope: "remote-managed",
        });

        const refused = yield* authorize({
          workspaceRoot,
          workflowPath: path.join(recipeRoot, "triage.workflow.ts"),
        });
        expect(refused._tag).toBe("Failure");

        // Still listed and validatable — only EXECUTION is withheld.
        const listed = yield* listProjectRecipesForAgent({ workspaceRoot });
        expect(listed.recipes.map((recipe) => recipe.id)).toEqual(["triage"]);
      }),
    );
  });

  it("refuses a symlinked pack recipe root and a symlink nested under a valid root", async () => {
    await run(
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const packDir = yield* makeTempDir("t3team-run-auth-pack-");
        const outsideDir = yield* makeTempDir("t3team-run-auth-outside-");
        const workspaceRoot = yield* makeTempDir("t3team-run-auth-ws-");

        // (1) The declared recipe directory IS a symlink pointing out of the pack.
        yield* writeRecipeDir({
          root: path.join(outsideDir, "triage"),
          id: "triage",
          displayName: "Outside triage",
        });
        NodeFS.mkdirSync(path.join(packDir, "recipes"), { recursive: true });
        NodeFS.symlinkSync(path.join(outsideDir, "triage"), path.join(packDir, "recipes/triage"));
        registerPack({ directory: packDir, recipes: [{ id: "triage", path: "recipes/triage" }] });

        const linkedRoot = yield* listProjectRecipesForAgent({ workspaceRoot });
        expect(linkedRoot.recipes).toEqual([]);
        expect(linkedRoot.diagnostics?.join(" ")).toContain("escapes its pack directory");
        const refusedLinkedRoot = yield* authorize({
          workspaceRoot,
          workflowPath: path.join(packDir, "recipes/triage/triage.workflow.ts"),
        });
        expect(refusedLinkedRoot._tag).toBe("Failure");

        // (2) A real recipe root whose declared workflow is a symlink to a file outside it.
        const packDir2 = yield* makeTempDir("t3team-run-auth-pack2-");
        const nestedRoot = path.join(packDir2, "recipes/nested");
        yield* writeRecipeDir({ root: nestedRoot, id: "nested", displayName: "Nested" });
        NodeFS.rmSync(path.join(nestedRoot, "triage.workflow.ts"));
        NodeFS.symlinkSync(
          path.join(outsideDir, "triage/triage.workflow.ts"),
          path.join(nestedRoot, "triage.workflow.ts"),
        );
        registerPack({ directory: packDir2, recipes: [{ id: "nested", path: "recipes/nested" }] });

        const nested = yield* listProjectRecipesForAgent({ workspaceRoot });
        expect(nested.recipes[0]?.workflowPath).toBeUndefined();
        expect(nested.errors[0]?.message).toContain("resolves outside");
        const refusedNested = yield* authorize({
          workspaceRoot,
          workflowPath: path.join(nestedRoot, "triage.workflow.ts"),
        });
        expect(refusedNested._tag).toBe("Failure");
      }),
    );
  });

  it("keeps writing and accepting the ephemeral .t3team-runs/<runId>/workflow.ts source", async () => {
    await run(
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const workspaceRoot = yield* makeTempDir("t3team-run-auth-ws-");

        const result = yield* authorize({
          workspaceRoot,
          runId: "run-eph",
          source: WORKFLOW_SOURCE,
        });
        expect(result._tag).toBe("Success");
        const expected = path.join(workspaceRoot, ".t3team-runs", "run-eph", "workflow.ts");
        if (result._tag === "Success") {
          // Exact equality matters: `canReplaceEphemeralSource` compares this path verbatim.
          expect(result.success).toBe(expected);
        }
        expect(NodeFS.existsSync(expected)).toBe(true);

        // The persisted ephemeral file is also accepted when passed back as a path.
        const byPath = yield* authorize({ workspaceRoot, workflowPath: expected });
        expect(byPath._tag).toBe("Success");
      }),
    );
  });

  it("still refuses a path outside the workspace with the workspace-root message", async () => {
    await run(
      Effect.gen(function* () {
        const workspaceRoot = yield* makeTempDir("t3team-run-auth-ws-");
        const refused = yield* authorize({
          workspaceRoot,
          workflowPath: "../outside.workflow.ts",
        });
        expect(refused._tag).toBe("Failure");
        if (refused._tag === "Failure") {
          expect(refused.failure).toContain("resolves outside");
        }
      }),
    );
  });
});
