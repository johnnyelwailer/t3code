/**
 * Args-repair guardrails, split out of `t3team-workflowRepairGuardrails.ts` for the additive
 * size budget: the source-repair guardrails already filled that file, and the args path is a
 * self-contained concern (validate a proposed args correction, parse the repair child's args
 * protocol) with no shared state — extracting it is a plain move, not a refactor.
 *
 * Same posture as the source guardrails: decision rules live here, away from the effectful
 * orchestration in `t3team-workflowSelfHeal.ts`, so no caller can weaken them by construction.
 */
import { extractMeta, prepareWorkflow } from "@t3team/sdk";
import * as Schema from "effect/Schema";

/** Result of validating a proposed args correction. Wrapped rather than a bare
 * nullable value: a schema can legitimately decode to `null`/`undefined`, which would be
 * indistinguishable from "invalid" if this returned the decoded value directly. */
export type WorkflowArgsRepairValidation =
  | { readonly ok: true; readonly args: unknown }
  | { readonly ok: false };

/**
 * Decode a proposed args correction against the ORIGINAL workflow's declared `meta.inputs` —
 * the exact schema the failed launch decoded against. Parses with the production loader, same
 * as `validateWorkflowRepairCandidate` (source guardrails); a workflow with no declared inputs
 * accepts anything (mirrors the loader's own `meta.inputs === undefined` passthrough).
 */
export const validateWorkflowArgsRepairCandidate = (input: {
  readonly originalSource: string;
  readonly replacementArgs: unknown;
  readonly absolutePath: string;
}): WorkflowArgsRepairValidation => {
  try {
    const meta = extractMeta(
      prepareWorkflow({ absolutePath: input.absolutePath, sourceText: input.originalSource }),
      { absolutePath: input.absolutePath, sourceText: input.originalSource },
      Schema,
    ) as unknown as { readonly inputs?: Schema.Schema<unknown> };
    if (meta.inputs === undefined) return { ok: true, args: input.replacementArgs };
    // Same `as never` idiom as the SDK's own decodeWithSchema: meta.inputs is a schema whose
    // concrete type is only known at runtime, so its DecodingServices param can't be proven
    // `never` statically.
    return {
      ok: true,
      args: Schema.decodeUnknownSync(meta.inputs as never)(input.replacementArgs),
    };
  } catch {
    return { ok: false };
  }
};

/** Weak fallback validator when no schema-aware validator is supplied (mirrors
 * `validateRepairedWorkflowSource`'s role for the source path): reject only structurally
 * impossible args. The real gate — decoding against the workflow's declared `meta.inputs` — is
 * `validateWorkflowArgsRepairCandidate` above, which the launch funnel always supplies. */
export const validateRepairedWorkflowArgs = (args: unknown): WorkflowArgsRepairValidation => {
  if (args === undefined) return { ok: false };
  try {
    JSON.stringify(args);
  } catch {
    return { ok: false };
  }
  return { ok: true, args };
};

export type WorkflowArgsRepairChildResult =
  | { readonly outcome: "fixed"; readonly updatedArgs: unknown; readonly summary: string }
  | { readonly outcome: "cannot-fix"; readonly reason: string };

/** Args-repair counterpart to `parseWorkflowRepairChildResult` (source guardrails): same strict
 * envelope, but the corrected value is `correctedArgs` (arbitrary JSON, not a source string). */
export const parseWorkflowArgsRepairChildResult = (
  value: unknown,
): WorkflowArgsRepairChildResult | null => {
  if (typeof value !== "string") return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const record = parsed as Record<string, unknown>;
    if (record.safeToResume === true) {
      if (
        Object.keys(record).length !== 3 ||
        !("correctedArgs" in record) ||
        typeof record.summary !== "string" ||
        !record.summary.trim()
      )
        return null;
      return { outcome: "fixed", updatedArgs: record.correctedArgs, summary: record.summary };
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
    return null;
  } catch {
    return null;
  }
};
