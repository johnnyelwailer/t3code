// @effect-diagnostics nodeBuiltinImport:off - temp git fixtures use node fs/child_process helpers.
// @effect-diagnostics preferSchemaOverJson:off - manifest fixtures are read back as raw JSON.
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterAll, expect, it } from "@effect/vitest";
import type { ProjectStateMigration } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Data from "effect/Data";
import * as TestClock from "effect/testing/TestClock";

import { WorkflowRunRepository } from "./persistence/WorkflowRuns.ts";
import { HIDDEN_T3TEAM_DIR } from "./t3team-project-repository-utils.ts";
import { switchProjectMainRepository } from "./t3team-projectMainRepositorySwitch.ts";
import {
  recordPendingStateMigration,
  settleFailedStateMigrationLaunch,
} from "./t3team-projectStateMigrationHandoff.ts";
import { planProjectStateMigration } from "./t3team-projectStateMigrationPlan.ts";
import {
  readStateMigrationRecord,
  writeStateMigrationRecord,
} from "./t3team-projectStateMigrationRecord.ts";
import {
  readStateMigrationStatus,
  settleStateMigration,
  STATE_MIGRATION_STALE_PENDING_MS,
} from "./t3team-projectStateMigrationStatus.ts";

const tempRoots: string[] = [];
const makeTempRoot = (prefix: string) => {
  const root = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), prefix));
  tempRoots.push(root);
  return root;
};
afterAll(() => {
  for (const root of tempRoots) NodeFS.rmSync(root, { recursive: true, force: true });
});

const write = (file: string, contents: string) => {
  NodeFS.mkdirSync(NodePath.dirname(file), { recursive: true });
  NodeFS.writeFileSync(file, contents);
};
const state = (root: string, ...segments: ReadonlyArray<string>) =>
  NodePath.join(root, HIDDEN_T3TEAM_DIR, ...segments);
const writeContextFiles = (root: string, count: number) => {
  for (let index = 0; index < count; index += 1) {
    write(state(root, "context", `file-${index}.md`), `${index}\n`);
  }
};

/** A project home whose linked clone `alpha` (a real git checkout) is the switch target. */
const makeProject = (contextFiles: number) => {
  const home = makeTempRoot("t3-state-handoff-");
  const alpha = state(home, "references", "01-alpha");
  NodeFS.mkdirSync(alpha, { recursive: true });
  NodeChildProcess.execFileSync("git", ["init", "-q"], { cwd: alpha });
  write(state(alpha, "recipes", "committed", "recipe.ts"), "committed\n");
  writeContextFiles(home, contextFiles);
  const linkedRepositories = [
    { url: "https://github.com/acme/alpha", localPath: alpha, status: "cloned" as const },
  ];
  write(
    state(home, "references", "reference-repositories.json"),
    JSON.stringify({ linkedRepositories }),
  );
  return { home, alpha };
};

const record = (overrides: Partial<ProjectStateMigration>): ProjectStateMigration => ({
  migrationId: "m-1",
  status: "running",
  fromRoot: "/from",
  toRoot: "/to",
  stateDir: ".t3team",
  excludes: [],
  startedAt: "2026-10-11T00:00:00.000Z",
  updatedAt: "2026-10-11T00:00:00.000Z",
  ...overrides,
});
class LaunchFailed extends Data.TaggedError("LaunchFailed")<{ readonly message: string }> {}

const AT = Date.parse("2026-10-11T00:00:00.000Z");

it.layer(NodeServices.layer)("state migration handoff", (it) => {
  it.effect("copies nothing when the target already has every file", () =>
    Effect.gen(function* () {
      const { home, alpha } = makeProject(3);
      writeContextFiles(alpha, 3);
      write(
        state(alpha, "references", "reference-repositories.json"),
        NodeFS.readFileSync(state(home, "references", "reference-repositories.json"), "utf8"),
      );
      expect(yield* planProjectStateMigration({ fromRoot: home, toRoot: alpha })).toEqual({
        kind: "none",
      });
    }),
  );

  it.effect("copies a small migration inline and hands a large one off", () =>
    Effect.gen(function* () {
      const { home, alpha } = makeProject(5);
      // 5 context files + the reference manifest are missing from the target.
      expect(
        yield* planProjectStateMigration({ fromRoot: home, toRoot: alpha, inlineLimit: 10 }),
      ).toEqual({ kind: "inline", missingFiles: 6 });
      expect(
        yield* planProjectStateMigration({ fromRoot: home, toRoot: alpha, inlineLimit: 3 }),
      ).toMatchObject({ kind: "handoff", missingFilesAtLeast: 4 });
    }),
  );

  it.effect("hands off a state dir larger than the scan budget, even with nothing missing", () =>
    Effect.gen(function* () {
      const { home, alpha } = makeProject(6);
      writeContextFiles(alpha, 6);
      expect(
        yield* planProjectStateMigration({ fromRoot: home, toRoot: alpha, scanBudget: 4 }),
      ).toEqual({ kind: "handoff", missingFilesAtLeast: 0, scanned: 5 });
    }),
  );

  it.effect("a large switch copies nothing inline but still records the main repository", () =>
    Effect.gen(function* () {
      const { home, alpha } = makeProject(250);
      const locked: string[] = [];
      const switched = yield* switchProjectMainRepository({
        project: { workspaceRoot: home },
        url: "https://github.com/acme/alpha",
        selection: "user",
        withManifestLock: (effect) =>
          Effect.sync(() => locked.push("manifest")).pipe(Effect.andThen(effect)),
      });
      expect(switched).toMatchObject({ changed: true, workspaceRoot: alpha, migratedPaths: [] });
      expect(switched.handoff?.missingFilesAtLeast).toBeGreaterThan(200);
      expect(NodeFS.existsSync(state(alpha, "context", "file-0.md"))).toBe(false);
      const manifest = JSON.parse(
        NodeFS.readFileSync(state(alpha, "references", "reference-repositories.json"), "utf8"),
      );
      expect(manifest.mainRepository.localPath).toBe(alpha);
      // The lock covers the manifest write only, once.
      expect(locked).toEqual(["manifest"]);
    }),
  );

  it.effect("a small switch still copies inline (target wins) with no handoff", () =>
    Effect.gen(function* () {
      const { home, alpha } = makeProject(3);
      const switched = yield* switchProjectMainRepository({
        project: { workspaceRoot: home },
        url: "https://github.com/acme/alpha",
        selection: "user",
      });
      expect(switched.handoff).toBeUndefined();
      expect(switched.migratedPaths).toContain("context/file-0.md");
      expect(NodeFS.readFileSync(state(alpha, "recipes", "committed", "recipe.ts"), "utf8")).toBe(
        "committed\n",
      );
    }),
  );

  it.effect("records one pending migration per checkout, replacing only a stale one", () =>
    Effect.gen(function* () {
      const toRoot = makeTempRoot("t3-state-record-");
      const first = yield* recordPendingStateMigration({
        fromRoot: "/from",
        toRoot,
        missingFilesAtLeast: 201,
      });
      expect(first.reused).toBe(false);
      expect(first.record).toMatchObject({ status: "pending", missingFilesAtLeast: 201 });
      expect((yield* readStateMigrationRecord(toRoot))?.migrationId).toBe(first.record.migrationId);

      const again = yield* recordPendingStateMigration({
        fromRoot: "/from",
        toRoot,
        missingFilesAtLeast: 300,
      });
      expect(again).toEqual({ record: first.record, reused: true });

      yield* TestClock.adjust(STATE_MIGRATION_STALE_PENDING_MS + 1);
      const replaced = yield* recordPendingStateMigration({
        fromRoot: "/from",
        toRoot,
        missingFilesAtLeast: 300,
      });
      expect(replaced.reused).toBe(false);
      expect(replaced.record.migrationId).not.toBe(first.record.migrationId);
    }),
  );

  it.effect("a launch that fails marks the migration failed instead of leaving it pending", () =>
    Effect.gen(function* () {
      const toRoot = makeTempRoot("t3-state-launch-");
      const { record: pending } = yield* recordPendingStateMigration({
        fromRoot: "/from",
        toRoot,
        missingFilesAtLeast: 201,
      });
      yield* settleFailedStateMigrationLaunch(
        pending,
        Effect.fail(new LaunchFailed({ message: "no provider" })),
      );
      expect(yield* readStateMigrationRecord(toRoot)).toMatchObject({
        status: "failed",
        error: "The migration thread could not be launched: no provider",
      });
    }),
  );

  it("settles a record from its run only once the run has ended", () => {
    const settle = (overrides: Partial<ProjectStateMigration>, run?: { status: never }) =>
      settleStateMigration({ record: record(overrides), run, nowMs: AT + 1_000 });
    expect(settle({})).toBeUndefined();
    expect(settle({ status: "completed" }, { status: "failed" as never })).toBeUndefined();
    expect(settle({}, { status: "suspended" as never })).toBeUndefined();
    expect(settle({}, { status: "completed" as never })).toEqual({ status: "completed" });
    expect(settle({}, { status: "cancelled" as never })).toEqual({
      status: "failed",
      error: "The migration run was cancelled.",
    });
    expect(settle({ status: "pending" })).toBeUndefined();
    expect(
      settleStateMigration({
        record: record({ status: "pending" }),
        run: undefined,
        nowMs: AT + STATE_MIGRATION_STALE_PENDING_MS + 1,
      }),
    ).toEqual({ status: "failed", error: "The migration thread was never launched." });
  });

  it.effect("the status read settles a running record whose run failed", () =>
    Effect.gen(function* () {
      const toRoot = makeTempRoot("t3-state-status-");
      const runs = Layer.succeed(WorkflowRunRepository, {
        getById: () => Effect.succeedSome({ status: "failed", failureReason: "agent turn failed" }),
      } as never);
      const read = () => readStateMigrationStatus(toRoot).pipe(Effect.provide(runs));
      expect(yield* read()).toEqual({ migration: null });
      yield* writeStateMigrationRecord(record({ toRoot, runId: "run-1" }));
      const status = yield* read();
      expect(status.migration).toMatchObject({ status: "failed", error: "agent turn failed" });
      expect((yield* readStateMigrationRecord(toRoot))?.status).toBe("failed");
    }),
  );
});
