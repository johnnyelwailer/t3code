// @effect-diagnostics nodeBuiltinImport:off - the default provider home is the OS user home.
import * as NodeOS from "node:os";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import { expandHomePath } from "../../pathExpansion.ts";
import {
  CodexHistoryRepairError,
  codexHistoryFileSystemError,
} from "./CodexHistoryRepairErrors.ts";
import {
  CODEX_HISTORY_REPAIR_POLICY,
  CURRENT_CODEX_ACTIVITY_KINDS,
  scanCodexRolloutFile,
} from "./CodexHistoryRepairPolicy.ts";
import {
  type CodexHistoryFilePlan,
  type CodexHistoryPlan,
  type CodexHistoryRepairInput,
  type CodexHistoryRepairReport,
  type CodexHistoryRepairStatus,
} from "./CodexHistoryRepairTypes.ts";

const ROLLOUT_DIRECTORIES = ["sessions", "archived_sessions"] as const;

function resolveHomePath(input: CodexHistoryRepairInput, path: Path.Path): string {
  const configured = input.homePath?.trim();
  const candidate = configured || process.env.CODEX_HOME || path.join(NodeOS.homedir(), ".codex");
  return path.resolve(input.cwd ?? process.cwd(), expandHomePath(candidate));
}

const listRolloutFiles = Effect.fn("listCodexRolloutFiles")(function* (
  directory: string,
  providerThreadId: string,
): Effect.fn.Return<
  ReadonlyArray<string>,
  CodexHistoryRepairError,
  FileSystem.FileSystem | Path.Path
> {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const exists = yield* fs
    .exists(directory)
    .pipe(
      Effect.mapError((cause) =>
        codexHistoryFileSystemError("discover", providerThreadId, directory, cause),
      ),
    );
  if (!exists) return [];

  const entries = yield* fs
    .readDirectory(directory)
    .pipe(
      Effect.mapError((cause) =>
        codexHistoryFileSystemError("discover", providerThreadId, directory, cause),
      ),
    );
  const files: Array<string> = [];
  for (const entry of entries.sort()) {
    const entryPath = path.join(directory, entry);
    const info = yield* fs
      .stat(entryPath)
      .pipe(
        Effect.mapError((cause) =>
          codexHistoryFileSystemError("discover", providerThreadId, entryPath, cause),
        ),
      );
    if (info.type === "Directory") {
      files.push(...(yield* listRolloutFiles(entryPath, providerThreadId)));
    } else if (info.type === "File" && entry.toLowerCase().endsWith(".jsonl")) {
      files.push(entryPath);
    }
  }
  return files;
});

export const buildCodexHistoryPlan = Effect.fn("buildCodexHistoryPlan")(function* (
  input: CodexHistoryRepairInput,
): Effect.fn.Return<CodexHistoryPlan, CodexHistoryRepairError, FileSystem.FileSystem | Path.Path> {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const homePath = resolveHomePath(input, path);
  const supportedActivityKinds = input.supportedActivityKinds ?? CURRENT_CODEX_ACTIVITY_KINDS;
  const directories = yield* Effect.forEach(
    ROLLOUT_DIRECTORIES,
    (directory) => listRolloutFiles(path.join(homePath, directory), input.providerThreadId),
    { concurrency: 1 },
  );
  const files: Array<CodexHistoryFilePlan> = [];

  for (const filePath of directories.flat()) {
    const originalContents = yield* fs
      .readFileString(filePath)
      .pipe(
        Effect.mapError((cause) =>
          codexHistoryFileSystemError("read", input.providerThreadId, filePath, cause),
        ),
      );
    const scan = scanCodexRolloutFile(
      filePath,
      originalContents,
      input.providerThreadId,
      supportedActivityKinds,
    );
    if (!scan.matchedThread) continue;
    files.push({
      filePath,
      findings: scan.findings,
      unsafeReasons: scan.unsafeReasons,
      originalContents,
      repairedContents: scan.repairedContents,
    });
  }

  const findings = files.flatMap((file) => file.findings);
  const unsafe = files.some((file) => file.unsafeReasons.length > 0);
  const changed = files.some((file) => file.originalContents !== file.repairedContents);
  const status: CodexHistoryRepairStatus =
    files.length === 0 ? "not-found" : unsafe ? "unsafe" : changed ? "repairable" : "clean";
  const reports = files.map(({ filePath, findings: fileFindings, unsafeReasons }) => ({
    filePath,
    findings: fileFindings,
    unsafeReasons,
  }));
  const report: CodexHistoryRepairReport = {
    providerThreadId: input.providerThreadId,
    homePath,
    policy: CODEX_HISTORY_REPAIR_POLICY,
    supportedActivityKinds: [...supportedActivityKinds],
    status,
    dryRun: input.dryRun === true,
    files: reports,
    findings,
    backups: [],
  };
  return { homePath, files, report };
});
