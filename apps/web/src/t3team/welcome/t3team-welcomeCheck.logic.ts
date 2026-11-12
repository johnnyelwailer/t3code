export const WELCOME_CHECK_TIMEOUT_MS = 8_000;

export type WelcomeCheck = "checking" | "failed" | "settled";

/**
 * A row's read of an outside service. A read that has not answered after
 * `WELCOME_CHECK_TIMEOUT_MS` counts as failed, so no row sits on "Checking…" forever.
 */
export function resolveWelcomeCheck(input: {
  readonly pending: boolean;
  readonly failed: boolean;
  readonly timedOut: boolean;
}): WelcomeCheck {
  if (input.failed || (input.pending && input.timedOut)) return "failed";
  return input.pending ? "checking" : "settled";
}
