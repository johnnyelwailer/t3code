/* oxlint-disable t3code/no-manual-effect-runtime-in-tests -- Bridges the launch API, like its siblings. */
// @effect-diagnostics nodeBuiltinImport:off - test harness writes a workflow fixture + temp dir.
/**
 * A workspace root may legitimately persist a literal `~`-prefixed path (see
 * apps/server/src/workspace/WorkspacePaths.ts). Before the fix, a recipe launch whose
 * `workflowPath` carried that literal `~` failed with `ENOENT` reading the workflow source —
 * Node's `fs` never expands `~` — and, separately, would have PERSISTED the un-expanded literal
 * on the run row, breaking rehydration after a restart the same way.
 *
 * `resolveLaunchWorkflowPath` (t3team-projectRecipeActionLaunch.ts) is the single expansion
 * point the launch route (t3team-thread-recipe-workflow-routes.ts) funnels every launch through
 * before calling `launchPreparedWorkflow`. This proves the COMPOSED behavior with the real
 * functions, not a reimplementation of the fix: given a `~`-prefixed workflowPath (and
 * recipePath), the run (a) actually completes — the shape-preview and engine reads both resolve
 * — and (b) the row persisted via the real `WorkflowRunRepository` holds the ABSOLUTE path.
 */

import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import { afterAll } from "vite-plus/test";
import { ProjectId, ProviderInstanceId } from "@t3tools/contracts";
import { createModelSelection } from "@t3tools/shared/model";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";

import { SqlitePersistenceMemory } from "./persistence/Layers/Sqlite.ts";
import { WorkflowJournalStoreLive } from "./persistence/Layers/SqliteJournalStore.ts";
import { WorkflowRunRepositoryLive } from "./persistence/Layers/WorkflowRuns.ts";
import { WorkflowJournalStore } from "./persistence/Services/WorkflowJournalStore.ts";
import { WorkflowRunRepository } from "./persistence/Services/WorkflowRuns.ts";
import { expandHomePath } from "./pathExpansion.ts";
import { resolveLaunchWorkflowPath } from "./t3team-projectRecipeActionLaunch.ts";
import { makeWorkflowEngineRegistry } from "./t3team-workflowEngineRegistry.ts";
import { launchPreparedWorkflow } from "./t3team-workflowEphemeralLaunch.ts";

// `<apps/server>/.t3team-runs/` — gitignored, so a crashed run cannot leave files the additive
// guard would report as new unprefixed sources (same trick as the scope-fixture tests).
const runsRoot = NodePath.join(
  NodeURL.fileURLToPath(new URL("..", import.meta.url)),
  ".t3team-runs",
);
NodeFS.mkdirSync(runsRoot, { recursive: true });
const root = NodeFS.mkdtempSync(NodePath.join(runsRoot, "tilde-launch-fixtures-"));
afterAll(() => NodeFS.rmSync(root, { recursive: true, force: true }));

const recipeRoot = NodePath.join(root, "tilde-recipe");
NodeFS.mkdirSync(recipeRoot, { recursive: true });
const workflowPathReal = NodePath.join(recipeRoot, "probe.workflow.ts");
NodeFS.writeFileSync(
  workflowPathReal,
  `export const meta = { name: "tilde.probe", capabilities: [] } as const;\nreturn { ok: true };\n`,
  "utf8",
);

// Plain string concatenation (not `path.join`) is load-bearing: joining "~" with a relative path
// that starts with ".." would normalize the two away, silently defeating this fixture. This never
// writes into the real `$HOME` — it only aliases the existing gitignored fixture path above.
const toTildePath = (absolutePath: string) => `~/${NodePath.relative(NodeOS.homedir(), absolutePath)}`;

const TestLayer = Layer.mergeAll(WorkflowRunRepositoryLive, WorkflowJournalStoreLive).pipe(
  Layer.provide(SqlitePersistenceMemory),
  Layer.merge(NodeServices.layer),
);

it.effect(
  "a `~`-prefixed launch actually reads the workflow source and persists an absolute path",
  () =>
    Effect.gen(function* () {
      const runRepository = yield* WorkflowRunRepository;
      const journalStore = yield* WorkflowJournalStore;
      // Real, not stubbed: the shape-preview step only runs `readFileString` when a real
      // FileSystem is wired in, and that read is the actual ENOENT site the fix repairs.
      const fileSystem = yield* FileSystem.FileSystem;
      const pathService = yield* Path.Path;

      // Mirrors t3team-thread-recipe-workflow-routes.ts's own expansion, exactly: the single
      // point every downstream consumer (reads, engine launch, persisted row) is fed from.
      const tildeRecipePath = toTildePath(recipeRoot);
      const recipePath = tildeRecipePath && expandHomePath(tildeRecipePath);
      const workflowPath = yield* resolveLaunchWorkflowPath({
        recipePath,
        workflowPath: toTildePath(workflowPathReal),
        actionName: undefined,
      });
      assert.strictEqual(workflowPath, workflowPathReal, "expanded to the real absolute path");
      assert.strictEqual(recipePath, recipeRoot, "recipePath expanded to the real absolute path");

      const runId = "tilde-launch-probe";
      const result = yield* launchPreparedWorkflow(
        {
          registry: makeWorkflowEngineRegistry(),
          runRepository,
          journalStore,
          rearmScheduler: () => Promise.resolve(),
          dispatch: async () => undefined,
          fileSystem,
          path: pathService,
        },
        {
          runId,
          workflowPath,
          args: {},
          recipePath,
          workspaceRoot: root,
          launchThreadId: "tilde-launch-thread",
          projectId: ProjectId.make("proj-tilde-launch"),
          modelSelection: createModelSelection(ProviderInstanceId.make("inst-1"), "model-x"),
          runtimeMode: "full-access",
          interactionMode: "default",
          origin: "recipe",
        },
      );

      // (a) No ENOENT: the engine actually imported and ran the workflow source.
      assert.strictEqual(result.status, "completed");

      // (b) The persisted row holds the ABSOLUTE path — a restart's rehydration re-reads THIS
      // value, so a literal `~` surviving here would reproduce the bug after every restart.
      const persisted = Option.getOrThrow(yield* runRepository.getById({ runId }));
      assert.strictEqual(persisted.workflowPath, workflowPathReal);
      assert.isFalse(persisted.workflowPath.startsWith("~"));
      assert.strictEqual(persisted.recipePath, recipeRoot);
    }).pipe(Effect.provide(TestLayer)),
);
