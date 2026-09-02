/** Static host guardrails for agent-proposed ephemeral workflow replacements. */
import { extractMeta, prepareWorkflow, WorkflowInputDecodeError } from "@t3team/sdk";
import * as Schema from "effect/Schema";

// The args-repair guardrails are their own module (additive size budget); re-exported so
// existing importers of this module keep resolving.
export * from "./t3team-workflowRepairArgsGuardrails.ts";

type MetaRecord = Record<string, unknown>;
const unsafePatterns = [
  /\bimport\s*(?:\(|[^;\n]*?\bfrom\s*)["']node:/g,
  /\brequire\s*\(/g,
  /\b(?:eval|Function)\s*\(/g,
  /\bprocess\s*\./g,
];

const strings = (value: unknown): string[] | null =>
  Array.isArray(value) && value.every((item) => typeof item === "string")
    ? [...value].sort()
    : value === undefined
      ? []
      : null;

const sameStrings = (left: unknown, right: unknown): boolean => {
  const a = strings(left);
  const b = strings(right);
  return (
    a !== null && b !== null && a.length === b.length && a.every((item, index) => item === b[index])
  );
};

const unsafeTokens = (source: string): Set<string> =>
  new Set(
    unsafePatterns.flatMap((pattern) =>
      [...source.matchAll(pattern)].map((match) => match[0].replace(/\s+/g, " ")),
    ),
  );

/** Parse with the production loader and keep the original authority envelope exactly unchanged. */
export const validateWorkflowRepairCandidate = (input: {
  readonly originalSource: string;
  readonly replacementSource: unknown;
  readonly absolutePath: string;
}): string | null => {
  if (typeof input.replacementSource !== "string") return null;
  const replacement = input.replacementSource.trim();
  if (!replacement || replacement.length > 200_000) return null;
  try {
    const original = extractMeta(
      prepareWorkflow({ absolutePath: input.absolutePath, sourceText: input.originalSource }),
      { absolutePath: input.absolutePath, sourceText: input.originalSource },
      Schema,
    ) as unknown as MetaRecord;
    const repaired = extractMeta(
      prepareWorkflow({ absolutePath: input.absolutePath, sourceText: replacement }),
      { absolutePath: input.absolutePath, sourceText: replacement },
      Schema,
    ) as unknown as MetaRecord;
    if (
      !sameStrings(original.capabilities, repaired.capabilities) ||
      !sameStrings(original.toolGroups, repaired.toolGroups) ||
      !sameStrings(original.permissions, repaired.permissions)
    )
      return null;
    const originalUnsafe = unsafeTokens(input.originalSource);
    if ([...unsafeTokens(replacement)].some((token) => !originalUnsafe.has(token))) return null;
  } catch {
    return null;
  }
  return input.replacementSource;
};

/** Which artifact a repair attempt must correct. An input-contract failure (the CALLER passed
 * wrong/missing launch args) is not a source defect — asking the repair model to rewrite the
 * workflow body would repair the wrong artifact. Typed discriminator on the raised error class
 * (see `WorkflowInputDecodeError`), never a message-string heuristic — this repo forbids
 * keyword/regex heuristics in an agent decision path. */
export type WorkflowRepairTarget = "args" | "source";

export const workflowRepairTargetFor = (error: unknown): WorkflowRepairTarget =>
  error instanceof WorkflowInputDecodeError ? "args" : "source";

/**
 * Attempt ceilings and failure/source admissibility, moved here from `t3team-workflowSelfHeal.ts`.
 *
 * Same concern as `validateWorkflowRepairCandidate` above: what the host will allow a repair to
 * be spent on and to write back. Keeping the decision rules together — and away from the effectful
 * orchestration — means no caller can weaken them by construction.
 */
export const T3TEAM_WORKFLOW_REPAIR_LIMIT = 3;
export const T3TEAM_WORKFLOW_REPAIR_HARD_LIMIT = 5;

export type WorkflowRepairIntent = {
  readonly goal: string;
  readonly expectedOutcome: string;
  readonly guardrails: readonly string[];
};

export type WorkflowRepairAudit = {
  readonly originalSource: string;
  readonly failure: string;
  readonly outcome: "recovered" | "failed";
  readonly replacementSource?: string;
  readonly summary?: string;
  readonly reason?: string;
};

export type WorkflowRepairChildResult =
  | { readonly outcome: "fixed"; readonly updatedSource: string; readonly summary: string }
  | { readonly outcome: "cannot-fix"; readonly reason: string };

/** Strict child protocol: only the discriminated fields cross from agent text into host writes. */
export const parseWorkflowRepairChildResult = (
  value: unknown,
): WorkflowRepairChildResult | null => {
  if (typeof value !== "string") return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const record = parsed as Record<string, unknown>;
    // Current protocol. `safeToResume` is an explicit host gate: a model must never cause a
    // same-run resume merely by returning source-shaped text. `correctedWorkflow` is the full
    // replacement (not a patch), so the atomic writer has one unambiguous target.
    if (record.safeToResume === true) {
      if (
        Object.keys(record).length !== 3 ||
        typeof record.correctedWorkflow !== "string" ||
        typeof record.summary !== "string" ||
        !record.correctedWorkflow.trim() ||
        !record.summary.trim()
      )
        return null;
      return { outcome: "fixed", updatedSource: record.correctedWorkflow, summary: record.summary };
    }
    if (record.safeToResume === false) {
      if (
        Object.keys(record).length !== 2 ||
        typeof record.cancelReason !== "string" ||
        !record.cancelReason.trim()
      )
        return null;
      return { outcome: "cannot-fix", reason: record.cancelReason };
    }
    // Compatibility for already-running repair children. New children receive the protocol above.
    if (record.outcome === "fixed") {
      if (
        Object.keys(record).length !== 3 ||
        typeof record.updatedSource !== "string" ||
        typeof record.summary !== "string"
      )
        return null;
      if (!record.updatedSource.trim() || !record.summary.trim()) return null;
      return { outcome: "fixed", updatedSource: record.updatedSource, summary: record.summary };
    }
    if (record.outcome === "cannot-fix") {
      if (
        Object.keys(record).length !== 2 ||
        typeof record.reason !== "string" ||
        !record.reason.trim()
      )
        return null;
      return { outcome: "cannot-fix", reason: record.reason };
    }
    return null;
  } catch {
    return null;
  }
};

const unsafeFailure =
  /\b(?:cancel(?:led|ed|ation)?|abort(?:ed|ing)?|auth(?:entication|orization)?|unauthori[sz]ed|forbidden|policy|capabilit(?:y|ies)|permission|approval|user[ _-]?input)\b/i;

/**
 * Only compiler/runtime defects can be repaired. Human, auth, and policy failures must surface.
 *
 * An input-contract failure ({@link WorkflowInputDecodeError}) is checked FIRST and by type, not
 * by message: the decode error names the offending key verbatim (e.g. `Missing key at
 * ["permission"]`), and a field literally named `permission`/`approval`/`capability` would
 * otherwise false-positive against `unsafeFailure` below and be wrongly refused.
 */
export const isRepairableWorkflowFailure = (error: unknown): boolean => {
  if (error instanceof WorkflowInputDecodeError) return true;
  const message = error instanceof Error ? error.message : String(error);
  return message.trim().length > 0 && !unsafeFailure.test(message);
};

/** Reject empty and script-like provider output before it can overwrite the durable source. */
export const validateRepairedWorkflowSource = (source: unknown): string | null => {
  if (typeof source !== "string") return null;
  const trimmed = source.trim();
  if (!trimmed || trimmed.length > 200_000) return null;
  // Workflow bodies must use the SDK workflow primitives. This is deliberately
  // conservative: a bad repair leaves the audited original source intact.
  if (!/\b(?:agent|thread|workflow)\s*\./.test(trimmed)) return null;
  return source;
};

export const canAttemptWorkflowRepair = (input: {
  readonly origin: "recipe" | "ephemeral";
  readonly repairAttempts: number;
  readonly maxAttempts?: number;
  readonly error: unknown;
}): boolean =>
  input.origin === "ephemeral" &&
  input.repairAttempts <
    Math.max(
      0,
      Math.min(
        T3TEAM_WORKFLOW_REPAIR_HARD_LIMIT,
        input.maxAttempts ?? T3TEAM_WORKFLOW_REPAIR_LIMIT,
      ),
    ) &&
  isRepairableWorkflowFailure(input.error);
