/**
 * Structured-value checks for `/thread/workflow/resolve-input` (Epic 25 §askUser decision
 * cards). A decision-card click posts a structured `value`; before the reply message is
 * dispatched, the value is checked against the pending ask's affordance descriptor so a stale
 * card or an out-of-range value is rejected with a clear error instead of being appended. This
 * is a fast pre-check on the host's hot index — the SDK's schema validation on resume remains
 * the authoritative gate (freeform composer text is never blocked here; the engine's
 * corrective-retry loop handles it).
 */

import type { AskFormField } from "@t3team/sdk";

import type { WorkflowPendingAsk } from "./t3team-workflowEngineRegistry.ts";

export interface WorkflowResolveValueCheck {
  readonly pending: WorkflowPendingAsk | undefined;
  /** The decision card's correlationId, when the client sent one — pins the reply to the ask
   * the card was rendered for. */
  readonly correlationId: string | undefined;
  readonly hasValue: boolean;
  readonly value: unknown;
}

/** Returns the rejection reason, or `null` when the resolve may proceed. */
export function rejectWorkflowResolveValue(check: WorkflowResolveValueCheck): string | null {
  const { pending, correlationId, hasValue, value } = check;
  if (correlationId !== undefined) {
    if (pending?.kind !== "user.input" || pending.correlationId !== correlationId) {
      return "This decision is no longer pending — the workflow has moved on.";
    }
  }
  if (!hasValue) return null;
  if (pending?.kind !== "user.input") {
    return "No workflow input is pending on this thread.";
  }
  const affordance = pending.affordance;
  // Unknown affordance (hot index lost across a restart): pass through — the SDK still
  // schema-validates on resume.
  if (affordance === undefined) return null;
  if (affordance.kind === "choice") {
    const chosen =
      affordance.field === undefined ? value : pickSingleField(value, affordance.field);
    if (typeof chosen === "string" && affordance.options.includes(chosen)) return null;
    return `Value does not match the offered choices (${affordance.options.join(", ")}).`;
  }
  if (affordance.kind === "boolean") {
    return typeof value === "boolean" ? null : "This decision expects yes or no.";
  }
  if (affordance.kind === "form") {
    return rejectFormValue(value, affordance.fields);
  }
  return "This ask takes a freeform text reply, not a structured value.";
}

/** Type-check a structured form submission against the affordance's fields. A pre-check only —
 * unknown extra keys are left to the SDK's authoritative Struct decode on resume. */
function rejectFormValue(value: unknown, fields: ReadonlyArray<AskFormField>): string | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return "This decision expects a form submission.";
  }
  const record = value as Record<string, unknown>;
  for (const field of fields) {
    const fieldValue = record[field.name];
    if (fieldValue === undefined) {
      if (field.optional) continue;
      return `Missing required field "${field.name}".`;
    }
    const reason = rejectFieldValue(field, fieldValue);
    if (reason !== null) return reason;
  }
  return null;
}

function rejectFieldValue(field: AskFormField, value: unknown): string | null {
  switch (field.type) {
    case "string":
      return typeof value === "string" ? null : `Field "${field.name}" must be text.`;
    case "number":
      return typeof value === "number" && Number.isFinite(value)
        ? null
        : `Field "${field.name}" must be a number.`;
    case "boolean":
      return typeof value === "boolean" ? null : `Field "${field.name}" must be yes or no.`;
    case "literals": {
      const options = field.options ?? [];
      return typeof value === "string" && options.includes(value)
        ? null
        : `Field "${field.name}" must be one of: ${options.join(", ")}.`;
    }
  }
}

/** A fielded choice must be submitted as exactly `{ [field]: option }`. */
function pickSingleField(value: unknown, field: string): unknown {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  return keys.length === 1 && keys[0] === field ? record[field] : undefined;
}

/** The human-readable text the reply message renders for a structured value. */
export function workflowReplyDisplayText(value: unknown, providedText: string): string {
  if (providedText.length > 0) return providedText;
  if (typeof value === "string") return value;
  return JSON.stringify(value) ?? "";
}
