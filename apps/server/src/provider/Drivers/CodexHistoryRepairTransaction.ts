import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import {
  CodexHistoryRepairError,
  codexHistoryFileSystemError,
} from "./CodexHistoryRepairErrors.ts";
import {
  BACKUP_SUFFIX,
  ensureCodexHistoryBackup,
  replaceCodexHistoryFileAtomically,
  rollbackCodexHistoryFiles,
  verifyCodexHistoryContents,
} from "./CodexHistoryRepairFileOperations.ts";
import {
  type CodexHistoryFilePlan,
  type CodexHistoryPlan,
  type CodexHistoryRepairInput,
  type CodexHistoryRepairReport,
} from "./CodexHistoryRepairTypes.ts";

export { BACKUP_SUFFIX };

export const applyCodexHistoryPlan = Effect.fn("applyCodexHistoryPlan")(function* (
  input: CodexHistoryRepairInput,
  plan: CodexHistoryPlan,
): Effect.fn.Return<
  CodexHistoryRepairReport,
  CodexHistoryRepairError,
  FileSystem.FileSystem | Path.Path
> {
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
    backups.push(yield* ensureCodexHistoryBackup(file, input.providerThreadId));
  }

  const attempted: Array<CodexHistoryFilePlan> = [];
  yield* Effect.forEach(
    changedPlans,
    (file) => {
      attempted.push(file);
      return replaceCodexHistoryFileAtomically(
        file,
        file.repairedContents,
        input.providerThreadId,
      ).pipe(
        Effect.andThen(
          verifyCodexHistoryContents(file, file.repairedContents, input.providerThreadId),
        ),
      );
    },
    { concurrency: 1, discard: true },
  ).pipe(
    Effect.catch((cause) =>
      rollbackCodexHistoryFiles(attempted, input.providerThreadId).pipe(
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
