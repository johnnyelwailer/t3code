/**
 * Model/provider configuration errors answer the same on every try, so they fail fast: no
 * transient retry ladder, no auto-resume (nx-nexi#1216). The texts are the host's own
 * `WorkflowModelSelectionError` messages as they reach the parent run.
 */
const DETERMINISTIC_CONFIG_TEXT = [
  /\bhas no declared default model\b/i,
  /\bhas no models configured to run a child on\b/i,
  /\bis not available on provider instance\b/i,
  /\bUnknown provider instance '/i,
  /\bProvider instance '[^']+' cannot run a child:/i,
  /\bCannot choose the latest model for provider instance\b/i,
] as const;

/** Whether the failure text is a deterministic model/provider configuration error. */
export const isDeterministicConfigFailureText = (message: string): boolean =>
  DETERMINISTIC_CONFIG_TEXT.some((pattern) => pattern.test(message));
