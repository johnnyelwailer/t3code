// @effect-diagnostics globalTimers:off - A React card polls on a plain timer outside an Effect runtime and cancels it by AbortSignal.
/**
 * The client side of adding a missing scope to a gh sign-in: how often to ask, when to stop, and the
 * words shown. Web and mobile share it so the two cards behave and read the same. No value is read here.
 */
export type CredentialRefreshState = "pending" | "done" | "failed";

export const CREDENTIAL_REFRESH_POLL_MS = 3000;
export const CREDENTIAL_REFRESH_FAILED_TEXT = "Sign-in was not completed. Try again.";

/** Asks until the sign-in is done or failed; `aborted` when the card goes away. A failed ask counts as failed. */
export async function awaitCredentialRefresh(input: {
  readonly poll: () => Promise<CredentialRefreshState>;
  readonly signal: AbortSignal;
  readonly intervalMs?: number;
}): Promise<"done" | "failed" | "aborted"> {
  const interval = input.intervalMs ?? CREDENTIAL_REFRESH_POLL_MS;
  while (!input.signal.aborted) {
    await new Promise<void>((resolve) => {
      const timer = setTimeout(done, interval);
      input.signal.addEventListener("abort", done, { once: true });
      function done() {
        clearTimeout(timer);
        input.signal.removeEventListener("abort", done);
        resolve();
      }
    });
    if (input.signal.aborted) break;
    const state = await input.poll().catch((): CredentialRefreshState => "failed");
    if (input.signal.aborted) break;
    if (state !== "pending") return state;
  }
  return "aborted";
}
