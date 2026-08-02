/**
 * Built-in journal kinds understood by the generic engine foundation.
 *
 * The type is intentionally open: adapters and capability packages may add their own
 * primitive identifiers without modifying `@runbook/core`.
 */
export const PRIMITIVE_KINDS = [
  "tool",
  "script",
  "script-never",
  "now",
  "random",
  "uuid",
  "wait",
  "parallel",
  "pipeline",
  "workflow",
  "thread.create",
  "thread.turn",
  "thread.message",
  "user.input",
  "wait.until",
  "model.resolve",
] as const;

/** Open primitive-kind vocabulary for adapter and catalog extensions. */
export type PrimitiveKind = string;
