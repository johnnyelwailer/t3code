/** Copy and states for the quit-and-retry screen shown while the daily Nexi app still holds the home. */
export type OldAppGuardState = "blocked" | "retrying" | "still-running" | "continuing";

export const OLD_APP_GUARD_MESSAGE = "Nexi Work is still running. Quit it, then click Retry.";
export const OLD_APP_GUARD_ERROR = "Nexi Work is still running.";
export const OLD_APP_GUARD_RETRY = "Retry";
export const OLD_APP_GUARD_RETRYING = "Retrying…";
export const OLD_APP_GUARD_CONTINUING = "Starting…";

export function oldAppGuardButtonLabel(state: OldAppGuardState): string {
  if (state === "retrying") return OLD_APP_GUARD_RETRYING;
  if (state === "continuing") return OLD_APP_GUARD_CONTINUING;
  return OLD_APP_GUARD_RETRY;
}

export function oldAppGuardButtonDisabled(state: OldAppGuardState): boolean {
  return state === "retrying" || state === "continuing";
}

export function oldAppGuardShowsError(state: OldAppGuardState): boolean {
  return state === "still-running";
}
