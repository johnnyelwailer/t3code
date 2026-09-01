import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import { buildCodexHistoryPlan } from "./CodexHistoryRepairDiscovery.ts";
import { CodexHistoryRepairError } from "./CodexHistoryRepairErrors.ts";
import { applyCodexHistoryPlan } from "./CodexHistoryRepairTransaction.ts";
import {
  type CodexHistoryRepairInput,
  type CodexHistoryRepairReport,
} from "./CodexHistoryRepairTypes.ts";

export const inspectCodexThreadHistory = Effect.fn("inspectCodexThreadHistory")(function* (
  input: CodexHistoryRepairInput,
): Effect.fn.Return<
  CodexHistoryRepairReport,
  CodexHistoryRepairError,
  FileSystem.FileSystem | Path.Path
> {
  return (yield* buildCodexHistoryPlan(input)).report;
});

export const repairCodexThreadHistory = Effect.fn("repairCodexThreadHistory")(function* (
  input: CodexHistoryRepairInput,
): Effect.fn.Return<
  CodexHistoryRepairReport,
  CodexHistoryRepairError,
  FileSystem.FileSystem | Path.Path
> {
  const plan = yield* buildCodexHistoryPlan(input);
  if (plan.report.status !== "repairable") return plan.report;
  return yield* applyCodexHistoryPlan(input, plan);
});

export { CodexHistoryRepairError };
