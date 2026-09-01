import type { CodexHistoryRepairFinding } from "./CodexHistoryRepairPolicy.ts";
import { CODEX_HISTORY_REPAIR_POLICY } from "./CodexHistoryRepairPolicy.ts";

export type CodexHistoryRepairStatus = "not-found" | "clean" | "repairable" | "unsafe" | "repaired";

export interface CodexHistoryRepairInput {
  readonly providerThreadId: string;
  readonly homePath?: string;
  readonly cwd?: string;
  readonly dryRun?: boolean;
}

export interface CodexHistoryFileReport {
  readonly filePath: string;
  readonly findings: ReadonlyArray<CodexHistoryRepairFinding>;
  readonly unsafeReasons: ReadonlyArray<string>;
}

export interface CodexHistoryRepairReport {
  readonly providerThreadId: string;
  readonly homePath: string;
  readonly policy: typeof CODEX_HISTORY_REPAIR_POLICY;
  readonly status: CodexHistoryRepairStatus;
  readonly dryRun: boolean;
  readonly files: ReadonlyArray<CodexHistoryFileReport>;
  readonly findings: ReadonlyArray<CodexHistoryRepairFinding>;
  readonly backups: ReadonlyArray<string>;
}

export interface CodexHistoryFilePlan extends CodexHistoryFileReport {
  readonly originalContents: string;
  readonly repairedContents: string;
}

export interface CodexHistoryPlan {
  readonly homePath: string;
  readonly files: ReadonlyArray<CodexHistoryFilePlan>;
  readonly report: CodexHistoryRepairReport;
}
