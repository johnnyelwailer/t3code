import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";

import { writeFileStringAtomically } from "../../atomicWrite.ts";
import {
  CodexHistoryRepairError,
  codexHistoryFileSystemError,
} from "./CodexHistoryRepairErrors.ts";
import {
  type CodexHistoryFilePlan,
  type CodexHistoryPlan,
  type CodexHistoryRepairInput,
  type CodexHistoryRepairReport,
} from "./CodexHistoryRepairTypes.ts";

export const BACKUP_SUFFIX = ".t3code-history-backup";
const backupPathFor = (filePath: string): string => `${filePath}${BACKUP_SUFFIX}`;

const ensureBackup = Effect.fn("backupCodexHistoryFile")(function* (
  plan: CodexHistoryFilePlan,
  providerThreadId: string,
): Effect.fn.Return<string, CodexHistoryRepairError, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  const backupPath = backupPathFor(plan.filePath);
  const backupExists = yield* fs
    .exists(backupPath)
    .pipe(
      Effect.mapError((cause) =>
        codexHistoryFileSystemError("backup", providerThreadId, backupPath, cause),
      ),
    );
  if (!backupExists) {
    yield* fs
      .copy(plan.filePath, backupPath, { overwrite: false })
      .pipe(
        Effect.mapError((cause) =>
          codexHistoryFileSystemError("backup", providerThreadId, backupPath, cause),
        ),
      );
  }

  const backup = yield* fs
    .readFileString(backupPath)
    .pipe(
      Effect.mapError((cause) =>
        codexHistoryFileSystemError("backup", providerThreadId, backupPath, cause),
      ),
    );
  if (backup !== plan.originalContents) {
    return yield* new CodexHistoryRepairError({
      operation: "backup",
      providerThreadId,
      filePath: plan.filePath,
      detail: `Backup '${backupPath}' does not match the current rollout; refusing to overwrite it.`,
    });
  }
  return backupPath;
});

const replaceFileAtomically = Effect.fn("replaceCodexHistoryFileAtomically")(function* (
  plan: CodexHistoryFilePlan,
  contents: string,
  providerThreadId: string,
): Effect.fn.Return<void, CodexHistoryRepairError, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  const sourceInfo = yield* fs
    .stat(plan.filePath)
    .pipe(
      Effect.mapError((cause) =>
        codexHistoryFileSystemError("write", providerThreadId, plan.filePath, cause),
      ),
    );
  yield* writeFileStringAtomically({
    filePath: plan.filePath,
    contents,
    mode: sourceInfo.mode & 0o777,
  }).pipe(
    Effect.mapError((cause) =>
      codexHistoryFileSystemError("write", providerThreadId, plan.filePath, cause),
    ),
  );
});

const verifyContents = Effect.fn("verifyCodexHistoryFile")(function* (
  plan: CodexHistoryFilePlan,
  expected: string,
  providerThreadId: string,
): Effect.fn.Return<void, CodexHistoryRepairError, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  const current = yield* fs
    .readFileString(plan.filePath)
    .pipe(
      Effect.mapError((cause) =>
        codexHistoryFileSystemError("verify", providerThreadId, plan.filePath, cause),
      ),
    );
  if (current !== expected) {
    return yield* new CodexHistoryRepairError({
      operation: "verify",
      providerThreadId,
      filePath: plan.filePath,
      detail: "The rollout changed unexpectedly while being repaired.",
    });
  }
});

const rollback = Effect.fn("rollbackCodexHistoryFiles")(function* (
  plans: ReadonlyArray<CodexHistoryFilePlan>,
  providerThreadId: string,
): Effect.fn.Return<void, CodexHistoryRepairError, FileSystem.FileSystem> {
  for (const plan of plans) {
    yield* replaceFileAtomically(plan, plan.originalContents, providerThreadId).pipe(
      Effect.mapError(
        (cause) =>
          new CodexHistoryRepairError({
            operation: "rollback",
            providerThreadId,
            filePath: plan.filePath,
            detail: "The repair failed and the original rollout could not be restored.",
            cause,
          }),
      ),
    );
  }
});

export const applyCodexHistoryPlan = Effect.fn("applyCodexHistoryPlan")(function* (
  input: CodexHistoryRepairInput,
  plan: CodexHistoryPlan,
): Effect.fn.Return<CodexHistoryRepairReport, CodexHistoryRepairError, FileSystem.FileSystem> {
  const changedPlans = plan.files.filter((file) => file.originalContents !== file.repairedContents);
  if (changedPlans.length === 0 || input.dryRun === true) return plan.report;

  const fs = yield* FileSystem.FileSystem;
  for (const file of changedPlans) {
    const current = yield* fs
      .readFileString(file.filePath)
      .pipe(
        Effect.mapError((cause) =>
          codexHistoryFileSystemError("verify", input.providerThreadId, file.filePath, cause),
        ),
      );
    if (current !== file.originalContents) {
      return yield* new CodexHistoryRepairError({
        operation: "verify",
        providerThreadId: input.providerThreadId,
        filePath: file.filePath,
        detail: "The rollout changed during inspection; run inspect again before repairing.",
      });
    }
  }

  const backups: Array<string> = [];
  for (const file of changedPlans) {
    backups.push(yield* ensureBackup(file, input.providerThreadId));
  }

  const attempted: Array<CodexHistoryFilePlan> = [];
  yield* Effect.forEach(
    changedPlans,
    (file) => {
      attempted.push(file);
      return replaceFileAtomically(file, file.repairedContents, input.providerThreadId).pipe(
        Effect.andThen(verifyContents(file, file.repairedContents, input.providerThreadId)),
      );
    },
    { concurrency: 1, discard: true },
  ).pipe(
    Effect.catch((cause) =>
      rollback(attempted, input.providerThreadId).pipe(
        Effect.mapError(
          (rollbackError) =>
            new CodexHistoryRepairError({
              operation: "rollback",
              providerThreadId: input.providerThreadId,
              detail: "The repair failed and rollback also failed.",
              cause: rollbackError,
            }),
        ),
        Effect.andThen(Effect.fail(cause)),
      ),
    ),
  );

  return { ...plan.report, status: "repaired", dryRun: false, backups };
});
