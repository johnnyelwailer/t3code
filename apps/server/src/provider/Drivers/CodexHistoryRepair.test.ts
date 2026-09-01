import * as NodeAssert from "node:assert/strict";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as PlatformError from "effect/PlatformError";
import * as Schema from "effect/Schema";

import { BACKUP_SUFFIX, applyCodexHistoryPlan } from "./CodexHistoryRepairTransaction.ts";
import { inspectCodexThreadHistory, repairCodexThreadHistory } from "./CodexHistoryRepair.ts";
import { CodexHistoryRepairError } from "./CodexHistoryRepairErrors.ts";
import { CODEX_HISTORY_REPAIR_POLICY, scanCodexRolloutFile } from "./CodexHistoryRepairPolicy.ts";
import type {
  CodexHistoryFilePlan,
  CodexHistoryPlan,
  CodexHistoryRepairReport,
} from "./CodexHistoryRepairTypes.ts";

const providerThreadId = "provider-thread-1";
const isCodexHistoryRepairError = Schema.is(CodexHistoryRepairError);

function eventRecord(
  item: Record<string, unknown>,
  kind: string,
  threadId = providerThreadId,
): string {
  return JSON.stringify({
    type: "event_msg",
    payload: {
      type: "item_completed",
      thread_id: threadId,
      item: { ...item, kind },
    },
  });
}

function rolloutContents(): string {
  return [
    JSON.stringify({ type: "session_meta", payload: { id: providerThreadId } }),
    JSON.stringify({
      type: "event_msg",
      payload: { type: "task_started", thread_id: providerThreadId, text: "keep this transcript" },
    }),
    eventRecord({ type: "SubAgentActivity", id: "started-id" }, "started"),
    eventRecord({ type: "SubAgentActivity", id: "interacted-id" }, "interacted"),
    eventRecord({ type: "SubAgentActivity", id: "interrupted-id" }, "interrupted"),
    eventRecord({ type: "SubAgentActivity", id: "legacy-id" }, "completed"),
    eventRecord({ type: "SubAgentActivity", id: "unknown-id" }, "failed"),
    eventRecord({ type: "SubAgentActivity", id: "other-thread-id" }, "failed", "other-thread"),
  ]
    .join("\n")
    .concat("\n");
}

function reportForPlans(
  homePath: string,
  files: ReadonlyArray<CodexHistoryFilePlan>,
): CodexHistoryPlan {
  const reports = files.map(({ filePath, findings, unsafeReasons }) => ({
    filePath,
    findings,
    unsafeReasons,
  }));
  const report: CodexHistoryRepairReport = {
    providerThreadId,
    homePath,
    policy: CODEX_HISTORY_REPAIR_POLICY,
    supportedActivityKinds: ["started", "interacted", "interrupted"],
    status: "repairable",
    dryRun: false,
    files: reports,
    findings: files.flatMap((file) => file.findings),
    backups: [],
  };
  return { homePath, files, report };
}

it.layer(NodeServices.layer)("Codex history repair", (it) => {
  it.effect("inspects, dry-runs, repairs, and repeats idempotently", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const homePath = yield* fs.makeTempDirectoryScoped({ prefix: "t3-codex-history-" });
      const rolloutPath = path.join(homePath, "sessions", "2026", "09", "01.jsonl");
      yield* fs.makeDirectory(path.dirname(rolloutPath), { recursive: true });
      const original = rolloutContents();
      yield* fs.writeFileString(rolloutPath, original);

      const inspected = yield* inspectCodexThreadHistory({
        providerThreadId,
        homePath,
        supportedActivityKinds: ["started", "interacted", "interrupted"],
      });
      NodeAssert.equal(inspected.status, "repairable");
      NodeAssert.deepStrictEqual(inspected.supportedActivityKinds, [
        "started",
        "interacted",
        "interrupted",
      ]);
      NodeAssert.equal(inspected.findings.length, 2);
      NodeAssert.deepStrictEqual(
        inspected.findings.map((finding) => finding.previousKind),
        ["completed", "failed"],
      );

      const dryRun = yield* repairCodexThreadHistory({
        providerThreadId,
        homePath,
        dryRun: true,
        supportedActivityKinds: ["started", "interacted", "interrupted"],
      });
      NodeAssert.equal(dryRun.status, "repairable");
      NodeAssert.equal(dryRun.dryRun, true);
      NodeAssert.equal(yield* fs.readFileString(rolloutPath), original);
      NodeAssert.equal(yield* fs.exists(`${rolloutPath}${BACKUP_SUFFIX}`), false);

      const repaired = yield* repairCodexThreadHistory({
        providerThreadId,
        homePath,
        supportedActivityKinds: ["started", "interacted", "interrupted"],
      });
      NodeAssert.equal(repaired.status, "repaired");
      NodeAssert.equal(repaired.backups.length, 1);
      NodeAssert.equal(yield* fs.readFileString(`${rolloutPath}${BACKUP_SUFFIX}`), original);
      const healed = yield* fs.readFileString(rolloutPath);
      NodeAssert.match(healed, /keep this transcript/);
      NodeAssert.match(healed, /started-id/);
      NodeAssert.doesNotMatch(healed, /legacy-id|unknown-id/);
      NodeAssert.match(healed, /other-thread-id/);

      const clean = yield* inspectCodexThreadHistory({
        providerThreadId,
        homePath,
        supportedActivityKinds: ["started", "interacted", "interrupted"],
      });
      NodeAssert.equal(clean.status, "clean");
      NodeAssert.equal(clean.findings.length, 0);
      const repeated = yield* repairCodexThreadHistory({
        providerThreadId,
        homePath,
        supportedActivityKinds: ["started", "interacted", "interrupted"],
      });
      NodeAssert.equal(repeated.status, "clean");
      NodeAssert.equal(repeated.backups.length, 0);
      NodeAssert.equal(yield* fs.readFileString(rolloutPath), healed);
    }),
  );

  it.effect("refuses an unsafe matching rollout without changing it", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const homePath = yield* fs.makeTempDirectoryScoped({ prefix: "t3-codex-history-unsafe-" });
      const rolloutPath = path.join(homePath, "sessions", "rollout.jsonl");
      yield* fs.makeDirectory(path.dirname(rolloutPath), { recursive: true });
      const original = `{"type":"session_meta","payload":{"id":"provider-thread-1"}}\nnot-json\n${eventRecord({ type: "SubAgentActivity", id: "unsafe-id" }, "completed")}\n`;
      yield* fs.writeFileString(rolloutPath, original);

      const report = yield* repairCodexThreadHistory({
        providerThreadId,
        homePath,
        supportedActivityKinds: ["started", "interacted", "interrupted"],
      });
      NodeAssert.equal(report.status, "unsafe");
      NodeAssert.equal(report.findings.length, 1);
      NodeAssert.equal(yield* fs.readFileString(rolloutPath), original);
      NodeAssert.equal(yield* fs.exists(`${rolloutPath}${BACKUP_SUFFIX}`), false);
    }),
  );

  it.effect("refuses to overwrite a mismatched deterministic backup", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const homePath = yield* fs.makeTempDirectoryScoped({ prefix: "t3-codex-history-backup-" });
      const rolloutPath = path.join(homePath, "sessions", "rollout.jsonl");
      const backupPath = `${rolloutPath}${BACKUP_SUFFIX}`;
      yield* fs.makeDirectory(path.dirname(rolloutPath), { recursive: true });
      const original = rolloutContents();
      yield* fs.writeFileString(rolloutPath, original);
      yield* fs.writeFileString(backupPath, "different source\n");

      const result = yield* repairCodexThreadHistory({ providerThreadId, homePath }).pipe(
        Effect.result,
      );
      NodeAssert.equal(result._tag, "Failure");
      if (result._tag === "Failure") {
        NodeAssert.ok(isCodexHistoryRepairError(result.failure));
        NodeAssert.equal(result.failure.operation, "backup");
      }
      NodeAssert.equal(yield* fs.readFileString(rolloutPath), original);
      NodeAssert.equal(yield* fs.readFileString(backupPath), "different source\n");
    }),
  );

  it.effect("rolls back every changed file when a later replacement fails", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const homePath = yield* fs.makeTempDirectoryScoped({ prefix: "t3-codex-history-rollback-" });
      const firstPath = path.join(homePath, "sessions", "first.jsonl");
      const secondPath = path.join(homePath, "sessions", "second.jsonl");
      yield* fs.makeDirectory(path.dirname(firstPath), { recursive: true });
      const firstOriginal = rolloutContents();
      const secondOriginal = rolloutContents().replace("legacy-id", "legacy-two");
      yield* fs.writeFileString(firstPath, firstOriginal);
      yield* fs.writeFileString(secondPath, secondOriginal);
      const firstScan = scanCodexRolloutFile(firstPath, firstOriginal, providerThreadId);
      const secondScan = scanCodexRolloutFile(secondPath, secondOriginal, providerThreadId);
      NodeAssert.match(firstScan.repairedContents, /legacy-id/);
      NodeAssert.doesNotMatch(firstScan.repairedContents, /unknown-id/);
      const files: Array<CodexHistoryFilePlan> = [firstScan, secondScan].map((scan) => ({
        filePath: scan.filePath,
        findings: scan.findings,
        unsafeReasons: scan.unsafeReasons,
        originalContents: scan.originalContents,
        repairedContents: scan.repairedContents,
      }));
      let renameCount = 0;
      const failingFileSystem: FileSystem.FileSystem = {
        ...fs,
        rename: (fromPath, toPath) => {
          renameCount += 1;
          return renameCount === 2
            ? Effect.fail(
                PlatformError.systemError({
                  _tag: "Unknown",
                  module: "FileSystem",
                  method: "rename",
                  pathOrDescriptor: toPath,
                  description: "injected test failure",
                }),
              )
            : fs.rename(fromPath, toPath);
        },
      };

      const result = yield* applyCodexHistoryPlan(
        { providerThreadId, homePath },
        reportForPlans(homePath, files),
      ).pipe(
        Effect.provideService(FileSystem.FileSystem, failingFileSystem),
        Effect.provideService(Path.Path, path),
        Effect.result,
      );
      NodeAssert.equal(result._tag, "Failure");
      NodeAssert.equal(yield* fs.readFileString(firstPath), firstOriginal);
      NodeAssert.equal(yield* fs.readFileString(secondPath), secondOriginal);
      NodeAssert.equal(yield* fs.readFileString(`${firstPath}${BACKUP_SUFFIX}`), firstOriginal);
      NodeAssert.equal(yield* fs.readFileString(`${secondPath}${BACKUP_SUFFIX}`), secondOriginal);
      NodeAssert.ok(renameCount >= 4);
    }),
  );
});
