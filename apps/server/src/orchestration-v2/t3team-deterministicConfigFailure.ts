/**
 * Failures that are a configuration fact, not a passing condition: re-running the same turn
 * gives the same answer, so they must fail fast instead of entering the transient retry ladder
 * and the "Gateway keeps failing" auto-resume (nx-nexi#1216).
 *
 * The texts are the host's own model-selection errors (`WorkflowModelSelectionError`,
 * `t3team-toolBrokerStartChildProvider*.ts`, `t3team-workflowModelSelection.ts`), which reach
 * the parent run as provider failure text once a child or workflow step could not start.
 *
 * @module t3team-deterministicConfigFailure
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
