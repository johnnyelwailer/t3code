// @effect-diagnostics nodeBuiltinImport:off - the harness scaffolds the recipe into a fixture workspace.
// @effect-diagnostics preferSchemaOverJson:off - the record is read back as raw JSON.
/**
 * Runs the SCAFFOLDED `migrate-project-state` recipe — the exact files project setup writes — through
 * the real launch funnel, with its real `recordOutcome` script writing through the run's workspace.
 * Only the workflow host is a recording fake, and the agent's reply is supplied the way the reactor
 * supplies it. What is under test: the body's final step marks the migration in the record the app
 * polls, and only the record of its own migration.
 */
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import { ProjectId, ProviderInstanceId, type ProjectStateMigration } from "@t3tools/contracts";
import { createModelSelection } from "@t3tools/shared/model";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import { afterAll } from "vite-plus/test";

import { ServerConfig } from "./config.ts";
import { layerMemory as SqlitePersistenceMemory } from "./persistence/Sqlite.ts";
import {
  WorkflowJournalStore,
  WorkflowJournalStoreLive,
} from "./persistence/SqliteJournalStore.ts";
import { WorkflowRunRepository, WorkflowRunRepositoryLive } from "./persistence/WorkflowRuns.ts";
import {
  STATE_MIGRATION_RECIPE_ID,
  stateMigrationRecipeSetupFiles,
} from "./t3team-projectSetupStateMigrationRecipe.ts";
import { MIGRATION_EXCLUDES } from "./t3team-projectMainRepositoryState.ts";
import {
  STATE_MIGRATION_RECORD_RELATIVE_PATH,
  writeStateMigrationRecord,
} from "./t3team-projectStateMigrationRecord.ts";
import { resolveRecipeWorkflowScripts } from "./t3team-recipeWorkflowScripts.ts";
import { makeWorkflowEngineRegistry } from "./t3team-workflowEngineRegistry.ts";
import { launchPreparedWorkflow } from "./t3team-workflowEphemeralLaunch.ts";
import { makeFakeWorkflowHost } from "./t3team-workflowHostFake.fixtures.ts";

const fixtureRoot = NodePath.join(
  NodePath.dirname(NodeURL.fileURLToPath(import.meta.url)),
  "../__fixtures__",
);
// Under __fixtures__ so the scaffolded recipe's `@t3team/sdk` / `effect` imports resolve.
const sandbox = NodeFS.mkdtempSync(NodePath.join(fixtureRoot, "t3team-state-migration-"));
afterAll(() => NodeFS.rmSync(sandbox, { recursive: true, force: true }));

const projectId = ProjectId.make("proj-state-migration");
const modelSelection = createModelSelection(ProviderInstanceId.make("inst-1"), "model-x");

const TestLayer = Layer.mergeAll(
  Layer.mergeAll(WorkflowRunRepositoryLive, WorkflowJournalStoreLive).pipe(
    Layer.provide(SqlitePersistenceMemory),
  ),
  ServerConfig.layerTest(sandbox, { prefix: "t3-state-migration-test-" }),
).pipe(Layer.provideMerge(NodeServices.layer));

const REPORT = {
  copiedFiles: 51_234,
  remainingMissingFiles: 0,
  conflicts: ["context/entrypoint.json"],
  ignoredFiles: 0,
  committableFiles: 0,
  summary: "Copied 51,234 files; context/entrypoint.json kept the main repository's version.",
};

const pendingRecord = (toRoot: string, migrationId: string): ProjectStateMigration => ({
  migrationId,
  status: "running",
  fromRoot: "/projects/home",
  toRoot,
  stateDir: ".t3team",
  excludes: [...MIGRATION_EXCLUDES],
  missingFilesAtLeast: 201,
  startedAt: "2026-10-11T00:00:00.000Z",
  updatedAt: "2026-10-11T00:00:00.000Z",
});

/** Scaffolds the recipe into a fresh checkout, launches it, and answers its copy turn. */
const runMigrationRecipe = (input: {
  readonly name: string;
  readonly recordedMigrationId: string;
  readonly runMigrationId: string;
  readonly report: typeof REPORT;
}) =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const toRoot = NodePath.join(sandbox, input.name);
    for (const file of stateMigrationRecipeSetupFiles()) {
      NodeFS.mkdirSync(NodePath.dirname(NodePath.join(toRoot, file.relativePath)), {
        recursive: true,
      });
      NodeFS.writeFileSync(NodePath.join(toRoot, file.relativePath), file.contents);
    }
    yield* writeStateMigrationRecord(pendingRecord(toRoot, input.recordedMigrationId));
    const recipePath = NodePath.dirname(
      NodePath.join(toRoot, stateMigrationRecipeSetupFiles()[0]!.relativePath),
    );
    const workflowPath = NodePath.join(recipePath, "workflow.ts");
    const scripts = yield* resolveRecipeWorkflowScripts({ recipePath, workflowPath });
    const registry = makeWorkflowEngineRegistry();
    const launchThreadId = `thread-${input.name}`;
    const host = makeFakeWorkflowHost();
    const launched = yield* launchPreparedWorkflow(
      {
        registry,
        runRepository: yield* WorkflowRunRepository,
        journalStore: yield* WorkflowJournalStore,
        rearmScheduler: async () => undefined,
        host: host.host,
        fileSystem,
        path,
      },
      {
        runId: `run-${input.name}`,
        workflowPath,
        args: {
          migrationId: input.runMigrationId,
          fromRoot: "/projects/home",
          toRoot,
          stateDir: ".t3team",
          excludes: [...MIGRATION_EXCLUDES],
          recordPath: STATE_MIGRATION_RECORD_RELATIVE_PATH,
          isGitCheckout: false,
          missingFilesAtLeast: 201,
        },
        scripts,
        recipePath,
        workspaceRoot: toRoot,
        launchThreadId,
        projectId,
        modelSelection,
        runtimeMode: "full-access",
        interactionMode: "default",
        origin: "recipe",
      },
    );
    assert.strictEqual(launched.status, "suspended");
    const turn = registry.peekPending(launchThreadId);
    assert.isDefined(turn);
    yield* Effect.promise(() =>
      registry.getRun(`run-${input.name}`)!.resume(turn!.correlationId, input.report),
    );
    const row = yield* (yield* WorkflowRunRepository).getById({ runId: `run-${input.name}` });
    const record = JSON.parse(
      NodeFS.readFileSync(NodePath.join(toRoot, STATE_MIGRATION_RECORD_RELATIVE_PATH), "utf8"),
    ) as ProjectStateMigration;
    return { row, record, prompts: host.turns().map((entry) => entry.text) };
  });

it.layer(TestLayer)("migrate-project-state recipe", (it) => {
  it.effect("its last step marks the migration completed in the polled record", () =>
    Effect.gen(function* () {
      const { row, record, prompts } = yield* runMigrationRecipe({
        name: "completes",
        recordedMigrationId: "m-1",
        runMigrationId: "m-1",
        report: REPORT,
      });
      assert.strictEqual(row._tag === "Some" ? row.value.status : undefined, "completed");
      assert.strictEqual(record.status, "completed");
      assert.strictEqual(record.conflicts, 1);
      assert.strictEqual(record.summary, REPORT.summary);
      assert.notStrictEqual(record.updatedAt, "2026-10-11T00:00:00.000Z");
      // The copy turn carries the app's rules: target wins, the same exclusions.
      assert.include(prompts[0] ?? "", "--ignore-existing");
      assert.include(prompts[0] ?? "", "--exclude='/child-session-worktrees/'");
      assert.include(prompts[0] ?? "", "--include='/references/reference-repositories.json'");
    }),
  );

  it.effect("a copy that left files behind is recorded as failed", () =>
    Effect.gen(function* () {
      const { record } = yield* runMigrationRecipe({
        name: "incomplete",
        recordedMigrationId: "m-2",
        runMigrationId: "m-2",
        report: { ...REPORT, remainingMissingFiles: 7 },
      });
      assert.strictEqual(record.status, "failed");
      assert.strictEqual(record.error, "7 files were not copied.");
    }),
  );

  it.effect("never overwrites the record of another migration", () =>
    Effect.gen(function* () {
      const { record } = yield* runMigrationRecipe({
        name: "replaced",
        recordedMigrationId: "m-newer",
        runMigrationId: "m-older",
        report: REPORT,
      });
      assert.strictEqual(record.migrationId, "m-newer");
      assert.strictEqual(record.status, "running");
    }),
  );

  it("ships under its id with no surfaces", () => {
    const files = stateMigrationRecipeSetupFiles();
    assert.deepStrictEqual(
      files.map((file) => file.relativePath.split("/").slice(-2).join("/")),
      [
        `${STATE_MIGRATION_RECIPE_ID}/recipe.ts`,
        `${STATE_MIGRATION_RECIPE_ID}/workflow.ts`,
        "scripts/recordOutcome.ts",
      ],
    );
    assert.include(files[0]!.contents, "surfaces: []");
    assert.include(files[0]!.contents, "scripts: { recordOutcome }");
  });
});
