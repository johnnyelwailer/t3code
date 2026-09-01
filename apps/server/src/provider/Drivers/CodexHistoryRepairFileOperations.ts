import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import { writeFileStringAtomically } from "../../atomicWrite.ts";
import {
  CodexHistoryRepairError,
  codexHistoryFileSystemError,
} from "./CodexHistoryRepairErrors.ts";
import { type CodexHistoryFilePlan } from "./CodexHistoryRepairTypes.ts";

export const BACKUP_SUFFIX = ".t3code-history-backup";

const backupPathFor = (filePath: string): string => `${filePath}${BACKUP_SUFFIX}`;

export const ensureCodexHistoryBackup = Effect.fn("backupCodexHistoryFile")(function* (
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

export const replaceCodexHistoryFileAtomically = Effect.fn("replaceCodexHistoryFileAtomically")(
  function* (
    plan: CodexHistoryFilePlan,
    contents: string,
    providerThreadId: string,
  ): Effect.fn.Return<void, CodexHistoryRepairError, FileSystem.FileSystem | Path.Path> {
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
  },
);

export const verifyCodexHistoryContents = Effect.fn("verifyCodexHistoryFile")(function* (
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

export const rollbackCodexHistoryFiles = Effect.fn("rollbackCodexHistoryFiles")(function* (
  plans: ReadonlyArray<CodexHistoryFilePlan>,
  providerThreadId: string,
): Effect.fn.Return<void, CodexHistoryRepairError, FileSystem.FileSystem | Path.Path> {
  for (const plan of plans) {
    yield* replaceCodexHistoryFileAtomically(plan, plan.originalContents, providerThreadId).pipe(
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
